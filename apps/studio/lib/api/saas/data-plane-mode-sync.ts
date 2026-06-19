import type { PlanId } from 'data/subscriptions/types'

import { executeQuery } from './query'
import {
  normalizeDataPlaneMode,
  resolveDataPlaneModeForPlan,
  type DataPlaneMode,
} from './data-plane-mode'
import { provisionTenantDataPlaneStack } from './tenant-data-plane-provision'

type ProjectRow = {
  ref: string
  data_plane_mode: string
  connection_string_enc: string | null
  connection_string: string | null
}

async function resolveOrgOwnerActorId(orgSlug: string): Promise<string | null> {
  const row = await executeQuery<{ gotrue_id: string }>({
    query: `
      select m.gotrue_id::text
      from saas.organizations o
      join saas.organization_members m on m.organization_id = o.id
      where o.slug = $1
        and m.role = 'owner'
      order by m.inserted_at asc nulls last, m.id asc
      limit 1
    `,
    parameters: [orgSlug],
  })
  if (row.error) throw row.error
  return row.data?.[0]?.gotrue_id ?? null
}

async function listOrganizationProjects(orgSlug: string): Promise<ProjectRow[]> {
  const row = await executeQuery<ProjectRow>({
    query: `
      select
        p.ref,
        p.data_plane_mode,
        p.connection_string_enc,
        p.connection_string
      from saas.projects p
      join saas.organizations o on o.id = p.organization_id
      where o.slug = $1
        and p.is_branch = false
      order by p.id asc
    `,
    parameters: [orgSlug],
  })
  if (row.error) throw row.error
  return row.data ?? []
}

function hasDedicatedDatabase(p: ProjectRow): boolean {
  return Boolean((p.connection_string_enc ?? '').trim() || (p.connection_string ?? '').trim())
}

/**
 * Reconcile project data_plane_mode rows and reprovision stacks when an org changes plan.
 * Free → shared_gateway (no per-tenant Traefik). Paid → isolated_stack (ref.domain).
 */
export async function syncOrganizationDataPlaneForPlan({
  orgSlug,
  planId,
  reason = 'plan_change',
}: {
  orgSlug: string
  planId: PlanId | string
  reason?: string
}): Promise<{ updated: number; reprovisioned: number; skipped: number }> {
  const targetMode = resolveDataPlaneModeForPlan(planId)
  const projects = await listOrganizationProjects(orgSlug)
  if (projects.length === 0) {
    return { updated: 0, reprovisioned: 0, skipped: 0 }
  }

  const actorId = await resolveOrgOwnerActorId(orgSlug)
  if (!actorId) {
    console.warn('[data-plane-mode-sync] no org owner for %s; skipping reprovision', orgSlug)
  }

  let updated = 0
  let reprovisioned = 0
  let skipped = 0

  for (const project of projects) {
    if (!hasDedicatedDatabase(project)) {
      skipped += 1
      continue
    }

    const currentMode = normalizeDataPlaneMode(project.data_plane_mode)
    if (currentMode === targetMode) {
      skipped += 1
      continue
    }

    const saved = await executeQuery({
      query: `
        update saas.projects p
        set data_plane_mode = $1
        from saas.organizations o
        where o.id = p.organization_id
          and o.slug = $2
          and p.ref = $3
      `,
      parameters: [targetMode, orgSlug, project.ref],
      actorId: actorId ?? 'system',
    })
    if (saved.error) throw saved.error
    updated += 1

    if (!actorId) continue

    try {
      await provisionTenantDataPlaneStack({
        claims: { sub: actorId } as Parameters<typeof provisionTenantDataPlaneStack>[0]['claims'],
        ref: project.ref,
        apply: true,
        reason,
      })
      reprovisioned += 1
    } catch (error) {
      console.warn(
        '[data-plane-mode-sync] reprovision failed for %s (%s → %s): %O',
        project.ref,
        currentMode,
        targetMode,
        error
      )
    }
  }

  return { updated, reprovisioned, skipped }
}

export async function backfillFreeOrganizationDataPlaneModes(): Promise<{
  organizations: number
  projects: number
}> {
  const row = await executeQuery<{ organizations: string; projects: string }>({
    query: `
      with updated as (
        update saas.projects p
        set data_plane_mode = 'shared_gateway'
        from saas.organizations o
        where o.id = p.organization_id
          and lower(o.plan) in ('free', 'platform')
          and (
            coalesce(trim(p.connection_string_enc), '') <> ''
            or coalesce(trim(p.connection_string), '') <> ''
          )
          and p.data_plane_mode <> 'shared_gateway'
        returning p.id
      )
      select
        (select count(distinct o.id)::text
         from saas.organizations o
         join saas.projects p on p.organization_id = o.id
         where lower(o.plan) in ('free', 'platform')
           and p.data_plane_mode = 'shared_gateway') as organizations,
        (select count(*)::text from updated) as projects
    `,
  })
  if (row.error) throw row.error
  const stats = row.data?.[0]
  return {
    organizations: parseInt(stats?.organizations ?? '0', 10),
    projects: parseInt(stats?.projects ?? '0', 10),
  }
}

export function describeDataPlaneTransition(
  from: DataPlaneMode,
  to: DataPlaneMode
): string {
  if (from === to) return 'unchanged'
  if (to === 'shared_gateway') return 'isolated_traefik_to_shared_gateway'
  if (to === 'isolated_stack') return 'shared_gateway_to_isolated_traefik'
  return `${from}_to_${to}`
}
