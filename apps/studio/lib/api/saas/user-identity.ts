import { executeQuery } from './query'

/**
 * Server-side resolution of the person/group properties PostHog needs for cohort analysis.
 *
 * Resolved on the server on purpose: plan drives revenue reporting and feature gating, so it must
 * come from the database rather than being asserted by the client, which can be tampered with.
 *
 * Note on country: PostHog derives `$geoip_country_name` from the request IP automatically, so it
 * is deliberately NOT set here — duplicating it would mean storing location data ourselves for no
 * added value.
 */

export type ResolvedIdentity = {
  /** Person properties — attached to the user. */
  person: {
    plan?: string
    role?: string
    organization_slug?: string
    is_team_member?: boolean
  }
  /** Organization group properties — attached to the org, for group-level breakdowns. */
  organization?: {
    slug: string
    name?: string
    plan?: string
    seat_count?: number
    project_count?: number
  }
}

/**
 * Look up plan, role, and organization shape for a user. Best-effort: identify must never fail a
 * request, so any error yields empty properties rather than throwing.
 */
export async function resolveUserIdentity({
  gotrueId,
  organizationSlug,
}: {
  gotrueId: string
  organizationSlug?: string
}): Promise<ResolvedIdentity> {
  if (!gotrueId || !organizationSlug) return { person: {} }

  try {
    const rows = await executeQuery<{
      plan: string | null
      name: string | null
      role: string | null
      seat_count: string | null
      project_count: string | null
    }>({
      query: `
        select
          o.plan,
          o.name,
          m.role,
          (select count(*)::text from saas.organization_members mm where mm.organization_id = o.id) as seat_count,
          (select count(*)::text from saas.projects p
            where p.organization_id = o.id and not coalesce(p.is_branch, false)) as project_count
        from saas.organizations o
        left join saas.organization_members m
          on m.organization_id = o.id and m.gotrue_id = $2
        where o.slug = $1
        limit 1
      `,
      parameters: [organizationSlug, gotrueId],
    })
    if (rows.error) throw rows.error

    const row = rows.data?.[0]
    if (!row) return { person: {} }

    const seatCount = Number(row.seat_count ?? 0) || 0

    return {
      person: {
        plan: row.plan ?? undefined,
        role: row.role ?? undefined,
        organization_slug: organizationSlug,
        // Distinguishes solo builders from teams — one of the more useful cohort splits.
        is_team_member: seatCount > 1,
      },
      organization: {
        slug: organizationSlug,
        name: row.name ?? undefined,
        plan: row.plan ?? undefined,
        seat_count: seatCount,
        project_count: Number(row.project_count ?? 0) || 0,
      },
    }
  } catch (error) {
    console.warn('[user-identity] resolve failed for %s/%s: %O', gotrueId, organizationSlug, error)
    return { person: {} }
  }
}
