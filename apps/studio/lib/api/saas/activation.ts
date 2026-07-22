import { capturePostHogEvent } from 'lib/posthog-server'
import { executeQuery } from './query'

/**
 * Activation tracking.
 *
 * A user is "activated" once they complete all four milestones:
 *   project_created -> app_generated -> app_deployed -> first_api_request
 *
 * Each milestone is recorded first-touch only, in saas.user_activation. That durability is the
 * whole point: the milestones happen across Builder and Studio, sometimes days apart, and a user
 * who deploys twice must not re-fire `user.activated` — otherwise activation rate and
 * time-to-activate are both wrong.
 *
 * Every function is best-effort. Analytics must never block or fail a product action.
 */

export type ActivationMilestone =
  | 'project_created'
  | 'app_generated'
  | 'app_deployed'
  | 'first_api_request'

const MILESTONE_COLUMN: Record<ActivationMilestone, string> = {
  project_created: 'project_created_at',
  app_generated: 'app_generated_at',
  app_deployed: 'app_deployed_at',
  first_api_request: 'first_api_request_at',
}

type ActivationRow = {
  project_created_at: string | null
  app_generated_at: string | null
  app_deployed_at: string | null
  first_api_request_at: string | null
  activated_at: string | null
  signed_up_at: string | null
}

function countCompleted(row: ActivationRow): number {
  return [
    row.project_created_at,
    row.app_generated_at,
    row.app_deployed_at,
    row.first_api_request_at,
  ].filter(Boolean).length
}

/**
 * Record a milestone for a user and emit analytics if it is newly reached.
 *
 * Repeat calls are a no-op at the database level (the `coalesce` below), so no duplicate events.
 */
export async function recordActivationMilestone({
  gotrueId,
  milestone,
  plan,
  organizationSlug,
}: {
  gotrueId: string
  milestone: ActivationMilestone
  plan?: string
  organizationSlug?: string
}): Promise<void> {
  if (!gotrueId) return

  const column = MILESTONE_COLUMN[milestone]
  if (!column) return

  try {
    /*
     * `coalesce(existing, now())` keeps the FIRST timestamp — re-deploying must not move the
     * milestone forward, or time-to-activate silently drifts. The returned row lets us decide
     * whether this call is what completed activation.
     */
    const upsert = await executeQuery<ActivationRow>({
      query: `
        insert into saas.user_activation (gotrue_id, ${column}, signed_up_at)
        values ($1, now(), now())
        on conflict (gotrue_id) do update
          set ${column} = coalesce(saas.user_activation.${column}, now()),
              updated_at = now()
        returning
          project_created_at,
          app_generated_at,
          app_deployed_at,
          first_api_request_at,
          activated_at,
          signed_up_at
      `,
      parameters: [gotrueId],
    })
    if (upsert.error) throw upsert.error

    const row = upsert.data?.[0]
    if (!row) return

    const completed = countCompleted(row)

    await capturePostHogEvent(gotrueId, 'user.activation_milestone', {
      milestone,
      milestones_completed: completed,
      plan,
      ...(organizationSlug ? { $groups: { organization: organizationSlug } } : {}),
    })

    // Fire the headline activation event exactly once, the moment the fourth milestone lands.
    if (completed === 4 && !row.activated_at) {
      const marked = await executeQuery<{ activated_at: string; signed_up_at: string | null }>({
        query: `
          update saas.user_activation
          set activated_at = now(), updated_at = now()
          where gotrue_id = $1 and activated_at is null
          returning activated_at, signed_up_at
        `,
        parameters: [gotrueId],
      })
      if (marked.error) throw marked.error

      // Empty result means a concurrent call won the race and already emitted the event.
      const activated = marked.data?.[0]
      if (!activated) return

      const signedUp = activated.signed_up_at ? Date.parse(activated.signed_up_at) : null
      const hoursToActivate =
        signedUp && Number.isFinite(signedUp)
          ? Math.round(((Date.parse(activated.activated_at) - signedUp) / 3_600_000) * 10) / 10
          : undefined

      await capturePostHogEvent(gotrueId, 'user.activated', {
        plan,
        hours_to_activate: hoursToActivate,
        ...(organizationSlug ? { $groups: { organization: organizationSlug } } : {}),
      })
    }
  } catch (error) {
    console.warn('[activation] failed to record %s for %s: %O', milestone, gotrueId, error)
  }
}
