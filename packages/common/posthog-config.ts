/** True when a PostHog project API key is configured (client bundle). */
export function isPostHogConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_POSTHOG_KEY)
}

/** PostHog ingest API host (US cloud default). */
export function getPostHogApiHost(): string {
  return process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com'
}

/** PostHog app UI host for toolbar / session replay links. */
export function getPostHogUiHost(): string {
  return process.env.NEXT_PUBLIC_POSTHOG_UI_HOST || 'https://us.posthog.com'
}
