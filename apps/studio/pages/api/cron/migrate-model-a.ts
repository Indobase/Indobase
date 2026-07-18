import type { NextApiRequest, NextApiResponse } from 'next'

import { isDedicatedDatabaseOnProjectCreateEnabled } from 'lib/api/saas/data-plane-mode'
import { finalizeDedicatedProjectProvisioning } from 'lib/api/saas/platform'
import { executeQuery } from 'lib/api/saas/query'

/**
 * Model A (one shared database, RLS-only isolation) → dedicated `tenantdb_<ref>` per project.
 *
 * Model A does not isolate GoTrue `auth.users`, Storage objects, or any table lacking a
 * `project_ref` + RLS policy, so tenants can read each other's data. This moves projects onto
 * their own Postgres database, which isolates them at the engine level.
 *
 * READ-ONLY by default — pass `?apply=1` to actually provision.
 *
 * ⚠️ This provisions an EMPTY database per project. It does NOT copy existing rows out of the
 * shared database. Any project that already holds data needs that data moved separately, and
 * shared-GoTrue `auth.users` carry no `project_ref`, so users cannot be attributed automatically.
 * Run the dry run first, and only apply to projects you have a data plan for.
 */
function authorizeCron(req: NextApiRequest): boolean {
  const expected =
    process.env.INDOBASE_CRON_SECRET?.trim() ||
    process.env.DATA_PLANE_PROVISIONER_TOKEN?.trim() ||
    ''
  if (!expected) return false

  const auth = req.headers.authorization?.trim() ?? ''
  if (auth === `Bearer ${expected}`) return true

  const header = req.headers['x-indobase-cron-secret']
  return typeof header === 'string' && header === expected
}

type SharedDbProject = {
  ref: string
  name: string
  data_plane_mode: string
  org_slug: string
  plan: string
  owner_gotrue_id: string | null
}

/** Projects still on the shared database: explicit model_a, or simply no dedicated connection string. */
async function listSharedDatabaseProjects(projectRef: string | null, limit: number) {
  const params: Array<string | number> = []
  let refFilter = ''
  if (projectRef) {
    params.push(projectRef)
    refFilter = `and p.ref = $${params.length}`
  }
  params.push(limit)

  const rows = await executeQuery<SharedDbProject>({
    query: `
      select
        p.ref,
        p.name,
        p.data_plane_mode,
        o.slug as org_slug,
        o.plan,
        (
          select m.gotrue_id::text
          from saas.organization_members m
          where m.organization_id = o.id and m.role = 'owner'
          order by m.inserted_at asc nulls last, m.gotrue_id asc
          limit 1
        ) as owner_gotrue_id
      from saas.projects p
      join saas.organizations o on o.id = p.organization_id
      where p.is_branch = false
        and (
          p.data_plane_mode = 'model_a'
          or (
            coalesce(trim(p.connection_string_enc), '') = ''
            and coalesce(trim(p.connection_string), '') = ''
          )
        )
        ${refFilter}
      order by p.id asc
      limit $${params.length}
    `,
    parameters: params,
  })
  if (rows.error) throw rows.error

  return rows.data ?? []
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST'])
    return res.status(405).json({ message: `Method ${req.method} Not Allowed` })
  }

  if (!authorizeCron(req)) {
    return res.status(401).json({ message: 'Unauthorized' })
  }

  const apply = req.query.apply === '1'
  const projectRef = typeof req.query.project_ref === 'string' ? req.query.project_ref.trim() : ''
  const limitRaw = typeof req.query.limit === 'string' ? parseInt(req.query.limit, 10) : 25
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 200) : 25

  try {
    const projects = await listSharedDatabaseProjects(projectRef || null, limit)

    if (!apply) {
      return res.status(200).json({
        success: true,
        mode: 'dry_run',
        shared_database_projects: projects.length,
        dedicated_on_create_enabled: isDedicatedDatabaseOnProjectCreateEnabled(),
        warning:
          projects.length > 0
            ? 'These projects share one database — auth users, storage, and non-RLS tables are cross-tenant visible. Applying provisions an EMPTY dedicated database per project; existing rows are NOT copied.'
            : 'No projects on the shared database. No migration needed.',
        projects: projects.map((p) => ({
          ref: p.ref,
          name: p.name,
          org: p.org_slug,
          plan: p.plan,
          data_plane_mode: p.data_plane_mode,
          has_owner: Boolean(p.owner_gotrue_id),
        })),
      })
    }

    // Applying while Model A is still the configured default would just re-mark rows as model_a.
    if (!isDedicatedDatabaseOnProjectCreateEnabled()) {
      return res.status(409).json({
        message:
          'Refusing to migrate: SAAS_DEDICATED_DATABASE_ON_PROJECT_CREATE is false, so provisioning would fall back to the shared database. Set it to true (with POSTGRES_HOST and POSTGRES_PASSWORD) and retry.',
      })
    }

    const results: Array<{ ref: string; ok: boolean; message?: string }> = []
    let migrated = 0

    for (const project of projects) {
      if (!project.owner_gotrue_id) {
        results.push({ ref: project.ref, ok: false, message: 'No org owner to act as provisioning actor' })
        continue
      }

      try {
        await finalizeDedicatedProjectProvisioning({
          projectRef: project.ref,
          gotrueId: project.owner_gotrue_id,
          deleteOnFailure: false,
        })
        migrated += 1
        results.push({ ref: project.ref, ok: true })
      } catch (error) {
        results.push({
          ref: project.ref,
          ok: false,
          message: error instanceof Error ? error.message : 'Unknown error',
        })
      }
    }

    return res.status(200).json({
      success: true,
      mode: 'apply',
      scanned: projects.length,
      migrated,
      failed: results.filter((r) => !r.ok).length,
      note: 'Dedicated databases are EMPTY. Existing shared-database rows were not copied.',
      results,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return res.status(500).json({ message })
  }
}
