import { PostHog } from 'posthog-node'

import { getPostHogApiHost, isPostHogConfigured } from 'common'

let client: PostHog | null = null

export function getPostHogServer(): PostHog | null {
  if (!isPostHogConfigured()) return null

  const apiKey = process.env.NEXT_PUBLIC_POSTHOG_KEY
  if (!apiKey) return null

  if (!client) {
    client = new PostHog(apiKey, {
      host: getPostHogApiHost(),
      flushAt: 1,
      flushInterval: 0,
    })
  }

  return client
}

export async function getPostHogFeatureFlags(
  distinctId: string,
  options: { groups?: Record<string, string> } = {}
): Promise<Record<string, unknown>> {
  const ph = getPostHogServer()
  if (!ph) return {}

  try {
    const flags = await ph.getAllFlags(distinctId, {
      groups: options.groups,
    })
    return flags ?? {}
  } catch (error) {
    console.error('PostHog getAllFlags failed:', error)
    return {}
  }
}

export async function capturePostHogEvent(
  distinctId: string,
  event: string,
  properties?: Record<string, unknown>
) {
  const ph = getPostHogServer()
  if (!ph) return

  ph.capture({
    distinctId,
    event,
    properties,
  })
  await ph.flush()
}

export async function capturePostHogException(
  distinctId: string,
  error: unknown,
  properties?: Record<string, unknown>
) {
  const ph = getPostHogServer()
  if (!ph) return

  const normalizedError = error instanceof Error ? error : new Error(String(error))

  ph.captureException(normalizedError, distinctId, properties)
  await ph.flush()
}

export async function identifyPostHogGroups(
  distinctId: string,
  options: {
    organizationSlug?: string
    projectRef?: string
    /** Person properties (plan, role, …) — resolved server-side, never trusted from the client. */
    personProperties?: Record<string, unknown>
    /** Extra organization group properties (plan, seat_count, …) for group-level breakdowns. */
    organizationProperties?: Record<string, unknown>
  }
) {
  const ph = getPostHogServer()
  if (!ph) return

  if (options.organizationSlug) {
    ph.groupIdentify({
      groupType: 'organization',
      groupKey: options.organizationSlug,
      // Plan lives on the group too, so revenue/usage can be broken down per organization.
      properties: { slug: options.organizationSlug, ...options.organizationProperties },
    })
  }

  if (options.projectRef) {
    ph.groupIdentify({
      groupType: 'project',
      groupKey: options.projectRef,
      properties: { ref: options.projectRef },
    })
  }

  ph.identify({
    distinctId,
    properties: {
      ...(options.organizationSlug && { organization_slug: options.organizationSlug }),
      ...(options.projectRef && { project_ref: options.projectRef }),
      // Plan/role here are what make Free-vs-Pro and role-based cohorts possible.
      ...options.personProperties,
    },
  })

  await ph.flush()
}
