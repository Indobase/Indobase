import type { NextApiRequest, NextApiResponse } from 'next'

import { generateProjectJwtSecret } from 'lib/api/saas/project-jwt'
import { executeQuery } from 'lib/api/saas/query'
import { updateProjectJwtSecret } from 'lib/api/saas/update-project-jwt-secret'

/**
 * Give every project its OWN JWT signing secret.
 *
 * Projects created before per-project secrets existed have `jwt_secret_enc = null` and therefore
 * fall back to the shared env secret (AUTH_JWT_SECRET / JWT_SECRET). Tenant GoTrue/PostgREST verify
 * only the JWT *signature* — the `project_ref` claim is not enforced — so every project sharing that
 * secret accepts every other project's anon/service key. That is a cross-tenant read of auth users,
 * tables, and storage.
 *
 * READ-ONLY by default — pass `?apply=1` to rotate.
 *
 * ⚠️ BREAKING BY DESIGN: rotating mints new anon/service keys for the project. Any app still using
 * the old key stops working and must be updated. That is unavoidable — the old keys are exactly the
 * ones that are valid across tenants. Roll it out deliberately (per project, with notice).
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

type SharedSecretProject = {
  ref: string
  name: string
  org_slug: string
  plan: string
  owner_gotrue_id: string | null
}

/**
 * Projects with no per-project secret — i.e. still signing/verifying with the shared env secret.
 * `plan` lets you roll out by blast radius: rotate `free` (prototypes) first, then paid tiers
 * one at a time with notice, since rotation invalidates their existing anon/service keys.
 */
async function listSharedSecretProjects(opts: {
  projectRef: string | null
  plan: string | null
  limit: number
}) {
  const params: Array<string | number> = []
  let refFilter = ''
  if (opts.projectRef) {
    params.push(opts.projectRef)
    refFilter = `and p.ref = $${params.length}`
  }

  let planFilter = ''
  if (opts.plan) {
    params.push(opts.plan)
    planFilter = `and lower(o.plan) = lower($${params.length})`
  }

  params.push(opts.limit)

  const rows = await executeQuery<SharedSecretProject>({
    query: `
      select
        p.ref,
        p.name,
        o.slug as org_slug,
        o.plan,
        (
          select m.gotrue_id::text
          from saas.organization_members m
          where m.organization_id = o.id and m.role = 'owner'
          order by m.inserted_at asc nulls last, m.id asc
          limit 1
        ) as owner_gotrue_id
      from saas.projects p
      join saas.organizations o on o.id = p.organization_id
      where p.is_branch = false
        and coalesce(trim(p.jwt_secret_enc), '') = ''
        ${refFilter}
        ${planFilter}
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
  const plan = typeof req.query.plan === 'string' ? req.query.plan.trim() : ''
  const limitRaw = typeof req.query.limit === 'string' ? parseInt(req.query.limit, 10) : 25
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 200) : 25

  try {
    const projects = await listSharedSecretProjects({
      projectRef: projectRef || null,
      plan: plan || null,
      limit,
    })

    if (!apply) {
      return res.status(200).json({
        success: true,
        mode: 'dry_run',
        projects_sharing_global_jwt_secret: projects.length,
        warning:
          projects.length > 0
            ? 'These projects have no per-project JWT secret, so they sign/verify with the shared env secret — each one accepts the others\' anon/service keys (cross-tenant reads). Applying rotates their secret AND mints new anon/service keys, which breaks apps still using the old key.'
            : 'Every project has its own JWT secret. No cross-tenant signing exposure.',
        projects: projects.map((p) => ({
          ref: p.ref,
          name: p.name,
          org: p.org_slug,
          plan: p.plan,
          has_owner: Boolean(p.owner_gotrue_id),
        })),
      })
    }

    const results: Array<{ ref: string; ok: boolean; message?: string }> = []
    let rotated = 0

    for (const project of projects) {
      if (!project.owner_gotrue_id) {
        results.push({ ref: project.ref, ok: false, message: 'No org owner to act as rotation actor' })
        continue
      }

      try {
        await updateProjectJwtSecret({
          claims: { sub: project.owner_gotrue_id } as Parameters<typeof updateProjectJwtSecret>[0]['claims'],
          ref: project.ref,
          jwtSecret: generateProjectJwtSecret(),
          changeTrackingId: `backfill-per-project-jwt-${project.ref}`,
        })
        rotated += 1
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
      rotated,
      failed: results.filter((r) => !r.ok).length,
      note: 'Rotated projects have NEW anon/service keys. Apps using the old keys must be updated.',
      results,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return res.status(500).json({ message })
  }
}
