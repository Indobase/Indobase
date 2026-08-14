/**
 * Static Launch / Go Live — hard path for agents (ADR 0005 + ADR 0006).
 *
 * Agents must call same-origin launchBusiness / POST /api/os/launch with real
 * html/files and may only claim live after a real URL from the API response.
 * Never third-party hosts. Enable ≠ Connect for capabilities.
 */

/** Keywords that MUST trigger the hard Go Live path. */
export const GO_LIVE_INTENT_KEYWORDS = [
  'go live',
  'take live',
  'launch my business',
  'launch business',
  'launch the business',
  'make it live',
  'publish my site',
  'publish the site',
  'put it online',
  'go public',
] as const

/** Third-party hosts agents must never suggest or invent. */
export const FORBIDDEN_HOST_PATTERNS = [
  /vercel\.app/i,
  /netlify\.app/i,
  /netlify\.com/i,
  /github\.io/i,
  /pages\.dev/i,
  /cloudflarepages/i,
  /firebaseapp\.com/i,
  /web\.app/i,
  /herokuapp\.com/i,
  /railway\.app/i,
  /render\.com/i,
  /surge\.sh/i,
  /glitch\.me/i,
] as const

/**
 * Dedicated agent tool — wraps same-origin POST /api/os/launch.
 * Prefer this over inventing URLs or naming third-party hosts.
 */
export const LAUNCH_BUSINESS_TOOL = {
  name: 'launchBusiness',
  aliases: ['goLive', 'launch_business', 'go_live'] as const,
  description:
    'Take the business live on Indobase. Posts real html/files to POST /api/os/launch. Returns the live URL. Never invent a URL.',
  method: 'POST' as const,
  path: '/api/os/tools/launchBusiness',
  /** Same handler; agent-friendly alias */
  aliasPath: '/api/os/tools/goLive',
  /** Canonical API the tool wraps */
  wraps: '/api/os/launch',
  parameters: {
    type: 'object',
    required: ['html_or_files'],
    properties: {
      title: { type: 'string', description: 'Business / site title' },
      subdomain: {
        type: 'string',
        description: 'Indobase subdomain label → https://{subdomain}.indobase.in',
      },
      customDomain: {
        type: 'string',
        description:
          'Optional domain they already own. Returns DNS CNAME → sites.indobase.in. Hosting stays on Indobase.',
      },
      html: { type: 'string', description: 'Full index HTML to publish (required if files omitted)' },
      files: {
        type: 'object',
        description: 'Path→content map (must include index.html if html omitted)',
        additionalProperties: { type: 'string' },
      },
    },
  },
} as const

/** Hard rules for agent system / session hints. */
export const LAUNCH_AGENT_HARD_RULES = `
## Go Live / Launch Business (HARD PATH — mandatory)

Production LIVE is the same job whether the operator (or agent) calls **launchBusiness** or **launchProductionApp**.
launchBusiness without production:false runs executeProductionLaunchJob. production:false is draft preview only.

When the operator says take live, launch, publish, go live, or launch my business:

1. Call launchBusiness or launchProductionApp immediately — they enqueue the same production job.
   Never say the launch service is unavailable. Never ask the operator to refresh.
2. Default live link: https://{subdomain}.sites.indobase.in (preview may be /live/{ref}/).
3. Optional customDomain after LIVE: domain they already own — DNS CNAME to sites.indobase.in.
4. ONLY claim live after BusinessRuntimeState.live.isLive and a non-empty live.url. Quote that exact url.
   NEVER invent, guess, or paste a third-party URL. NEVER say the business is live without runtime evidence.
5. NEVER ask which host to use. NEVER suggest page builders, git pages, generic CDNs, or external hosts.
6. The production job enables accounts, catalog, or data when that business type needs them. Do not pick ensure* or guidedBackend.
   NEVER say Connect Neon/Coolify/Stripe/Postgres/Docker or ask which vendor.
   Providers are hidden. Enable ≠ Connect.
`.trim()

/** Compact one-liner for session hint bags. */
export const LAUNCH_SESSION_HINT =
  'Go Live HARD PATH: launchBusiness and launchProductionApp run the same production job (executeProductionLaunchJob). production:false on launchBusiness is draft preview only. Claim live ONLY from BusinessRuntimeState.live. Never ask the operator to refresh. Never say the launch service is unavailable. Indobase subdomain (*.sites.indobase.in) or their domain (CNAME → sites.indobase.in). NEVER third-party hosts. Enable ≠ Connect.'

export function promptLooksLikeGoLiveIntent(prompt: string): boolean {
  const text = String(prompt || '').toLowerCase()
  if (!text.trim()) return false
  return GO_LIVE_INTENT_KEYWORDS.some((kw) => text.includes(kw))
}

export function urlLooksLikeForbiddenHost(url: string): boolean {
  const raw = String(url || '').trim()
  if (!raw) return false
  return FORBIDDEN_HOST_PATTERNS.some((re) => re.test(raw))
}

export type LiveClaimCheck = {
  allowed: boolean
  reason?: string
}

/**
 * Agents may claim live only when the Launch API succeeded with a real URL
 * that is not a forbidden third-party host.
 */
export function assertCanClaimLive(result: {
  ok?: boolean
  url?: string | null
}): LiveClaimCheck {
  if (!result?.ok) {
    return { allowed: false, reason: 'Launch API did not succeed — do not claim live.' }
  }
  const url = typeof result.url === 'string' ? result.url.trim() : ''
  if (!url) {
    return { allowed: false, reason: 'Launch API returned no url — do not invent one.' }
  }
  if (urlLooksLikeForbiddenHost(url)) {
    return {
      allowed: false,
      reason: 'Live URL must be Indobase (*.indobase.in / /live/…) or customer domain on Indobase.',
    }
  }
  return { allowed: true }
}

export type LaunchContentCheck = {
  ok: boolean
  message?: string
}

/** Agent tool path requires real html or files — no empty go-live. */
export function assertLaunchHasContent(input: {
  html?: unknown
  files?: unknown
}): LaunchContentCheck {
  const html = typeof input.html === 'string' ? input.html.trim() : ''
  if (html.length > 0) return { ok: true }

  if (input.files && typeof input.files === 'object' && !Array.isArray(input.files)) {
    const entries = Object.entries(input.files as Record<string, unknown>).filter(
      ([, v]) => typeof v === 'string' && String(v).trim().length > 0,
    )
    if (entries.length > 0) return { ok: true }
  }

  return {
    ok: false,
    message:
      'launchBusiness requires real html or files (e.g. index.html). Do not call empty and do not invent a live URL.',
  }
}
