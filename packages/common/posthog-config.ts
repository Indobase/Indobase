import type { PostHogConfig } from 'posthog-js'

/** True when a PostHog project API key is configured (client bundle). */
export function isPostHogConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_POSTHOG_KEY)
}

/** PostHog SDK error-tracking autocapture (unhandled errors + rejections). */
export function getPostHogCaptureExceptionsConfig(): NonNullable<
  PostHogConfig['capture_exceptions']
> {
  return {
    capture_unhandled_errors: true,
    capture_unhandled_rejections: true,
    capture_console_errors: false,
  }
}

/**
 * Routes where session replay must never run. Studio renders live secrets — service_role keys,
 * JWT signing secrets, Postgres connection strings — and billing pages carry payment detail.
 * Recording those would put credentials into replay storage, so replay is stopped outright rather
 * than relying on field-level masking alone.
 */
const REPLAY_BLOCKED_PATH_PATTERNS: RegExp[] = [
  /\/settings\/api/i, // API keys / service_role
  /\/settings\/vault/i, // secrets vault
  /\/settings\/database/i, // connection strings
  /\/settings\/billing/i,
  /\/billing/i,
  /\/org\/[^/]+\/billing/i,
  /\/sign-in|\/sign-up|\/login|\/register|\/reset-password|\/forgot-password/i,
  /\/settings\/secrets|\/secrets/i,
  /\/settings\/integrations/i, // third-party tokens
]

/** True when session replay must be suppressed for this path. */
export function isSessionReplayBlockedPath(pathname: string): boolean {
  const path = (pathname || '').split('?')[0]
  return REPLAY_BLOCKED_PATH_PATTERNS.some((pattern) => pattern.test(path))
}

/**
 * Session replay defaults. Everything that can carry a secret is masked at the source: all inputs
 * are masked by default, and password fields never record. Deliberately stricter than PostHog's
 * defaults — a product metric is not worth leaking a customer's database password.
 */
export function getPostHogSessionRecordingConfig(): NonNullable<PostHogConfig['session_recording']> {
  return {
    maskAllInputs: true,
    maskInputOptions: {
      password: true,
      email: true,
      tel: true,
      text: true,
      textarea: true,
      number: true,
    },
    // Elements carrying secrets can opt out entirely with class="ph-no-capture".
    blockClass: 'ph-no-capture',
    maskTextClass: 'ph-mask',
  }
}

/** PostHog ingest API host (US cloud default). */
export function getPostHogApiHost(): string {
  return process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com'
}

/** PostHog app UI host for toolbar / session replay links. */
export function getPostHogUiHost(): string {
  return process.env.NEXT_PUBLIC_POSTHOG_UI_HOST || 'https://us.posthog.com'
}
