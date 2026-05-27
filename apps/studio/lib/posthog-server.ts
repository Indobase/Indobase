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

export async function identifyPostHogGroups(
  distinctId: string,
  options: { organizationSlug?: string; projectRef?: string }
) {
  const ph = getPostHogServer()
  if (!ph) return

  if (options.organizationSlug) {
    ph.groupIdentify({
      groupType: 'organization',
      groupKey: options.organizationSlug,
      properties: { slug: options.organizationSlug },
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
    },
  })

  await ph.flush()
}
