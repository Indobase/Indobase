import { executeQuery } from './query'
import { getPlanEntitlements, assertFeatureAllowed } from './plan-entitlements'

/**
 * Gate Auth / Database / Storage / Functions Studio surfaces to Pro+.
 * Free & Basic are frontend-only (no backend Studio).
 */
export async function assertBackendStudioAccessForProject(
  projectRef: string
): Promise<{ ok: true; plan: string } | { ok: false; message: string; upgradeHint: string; plan: string }> {
  const rows = await executeQuery<{ plan: string; organization_slug: string }>({
    query: `
      select o.plan, o.slug as organization_slug
      from saas.projects p
      join saas.organizations o on o.id = p.organization_id
      where p.ref = $1
      limit 1
    `,
    parameters: [projectRef],
  })

  if (rows.error) throw rows.error
  const row = rows.data?.[0]
  if (!row) {
    return {
      ok: false,
      plan: 'free',
      message: 'Project not found',
      upgradeHint: 'Create or open a project first.',
    }
  }

  const gate = assertFeatureAllowed(row.plan, 'backendStudio')
  if (!gate.ok) {
    return {
      ok: false,
      plan: row.plan,
      message: gate.message,
      upgradeHint: `${gate.upgradeHint} Billing: /org/${encodeURIComponent(row.organization_slug)}/billing`,
    }
  }

  return { ok: true, plan: row.plan }
}

export function backendStudioBlockedPayload(result: {
  message: string
  upgradeHint: string
  plan: string
}) {
  const e = getPlanEntitlements(result.plan)
  return {
    code: 'BACKEND_STUDIO_LOCKED',
    message: result.message,
    upgrade_hint: result.upgradeHint,
    plan: e.planId,
    plan_name: e.displayName,
  }
}
