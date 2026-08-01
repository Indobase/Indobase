declare global {
  interface Window {
    __INDOBASE_PUBLIC_ENV__?: {
      anonKey?: string
      gotrueUrl?: string
      /** Runtime Studio public origin (overrides bake-time NEXT_PUBLIC_SITE_URL). */
      siteUrl?: string
      /** Runtime Builder public origin (overrides bake-time NEXT_PUBLIC_BUILDER_APP_URL). */
      builderAppUrl?: string
      /** Runtime hCaptcha site key (overrides bake-time NEXT_PUBLIC_HCAPTCHA_SITE_KEY). */
      hcaptchaSiteKey?: string
    }
  }
}

/** Default Supabase demo anon JWT — must not be sent to production Kong. */
export const KNOWN_DEMO_SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNjQxNzY5MjAwLCJleHAiOjE3OTk1MzU2MDB9.a2OVYRGwrwKSgCs3-hDUqeQvvvoDm2o8FdzPc0NJQJk'

function isUsableAnonKey(key: string | undefined): key is string {
  const trimmed = key?.trim()
  return Boolean(trimmed && trimmed !== KNOWN_DEMO_SUPABASE_ANON_KEY)
}

function normalizePublicOrigin(url: string | undefined): string | undefined {
  const trimmed = url?.trim()
  if (!trimmed) return undefined
  return trimmed.replace(/\/+$/, '')
}

/**
 * Server/runtime anon key for Kong. Prefer non-NEXT_PUBLIC vars because Next inlines
 * NEXT_PUBLIC_* at image build time (often the demo key from CI).
 */
export function resolveServerPublicAnonKey(): string {
  const candidates = [
    process.env.SUPABASE_ANON_KEY,
    process.env.ANON_KEY,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    process.env.NEXT_PUBLIC_ANON_KEY,
  ]

  for (const candidate of candidates) {
    if (isUsableAnonKey(candidate)) return candidate.trim()
  }

  return ''
}

/** Browser-reachable GoTrue base URL (never internal docker hostnames). */
export function resolvePublicGotrueUrlForBrowser(): string | undefined {
  const candidates = [
    process.env.NEXT_PUBLIC_GOTRUE_URL,
    process.env.SUPABASE_PUBLIC_URL
      ? `${process.env.SUPABASE_PUBLIC_URL.replace(/\/$/, '')}/auth/v1`
      : undefined,
    process.env.NEXT_PUBLIC_API_URL
      ? `${process.env.NEXT_PUBLIC_API_URL.replace(/\/$/, '')}/auth/v1`
      : undefined,
  ]

  for (const candidate of candidates) {
    const trimmed = candidate?.trim()
    if (trimmed) return trimmed
  }

  return undefined
}

/** Studio public origin from server/runtime env (staging containers override CI bake-ins). */
export function resolveServerPublicSiteUrl(): string | undefined {
  return normalizePublicOrigin(
    process.env.SITE_URL || process.env.NEXT_PUBLIC_SITE_URL || process.env.SUPABASE_PUBLIC_URL
  )
}

/** Builder public origin from server/runtime env. */
export function resolveServerPublicBuilderAppUrl(): string | undefined {
  return normalizePublicOrigin(
    process.env.BUILDER_APP_URL || process.env.NEXT_PUBLIC_BUILDER_APP_URL
  )
}

/**
 * Public anon key for Kong / GoTrue. CI bakes `NEXT_PUBLIC_ANON_KEY` at build time;
 * production Studio also sets `SUPABASE_ANON_KEY` at runtime. Prefer the injected
 * window config (from _document) so split-deploy images work without rebuild.
 */
export function resolvePublicAnonKey(): string {
  if (typeof window !== 'undefined') {
    const injected = window.__INDOBASE_PUBLIC_ENV__?.anonKey
    if (isUsableAnonKey(injected)) return injected.trim()
  }

  return resolveServerPublicAnonKey()
}

export function resolvePublicGotrueUrl(): string | undefined {
  if (typeof window !== 'undefined') {
    const injected = window.__INDOBASE_PUBLIC_ENV__?.gotrueUrl?.trim()
    if (injected) return injected
  }

  return resolvePublicGotrueUrlForBrowser()
}

export function resolvePublicSiteUrl(): string | undefined {
  if (typeof window !== 'undefined') {
    const injected = normalizePublicOrigin(window.__INDOBASE_PUBLIC_ENV__?.siteUrl)
    if (injected) return injected
  }

  return resolveServerPublicSiteUrl()
}

export function resolvePublicBuilderAppUrl(): string | undefined {
  if (typeof window !== 'undefined') {
    const injected = normalizePublicOrigin(window.__INDOBASE_PUBLIC_ENV__?.builderAppUrl)
    if (injected) return injected
  }

  return resolveServerPublicBuilderAppUrl()
}

/**
 * Hydrate browser auth/public config from a runtime API when SSG HTML omitted values.
 * Safe to call multiple times; deduped per page load.
 */
let runtimePublicEnvBootstrap: Promise<void> | null = null

function hasCompleteRuntimePublicEnv(): boolean {
  return Boolean(
    isUsableAnonKey(window.__INDOBASE_PUBLIC_ENV__?.anonKey) &&
      window.__INDOBASE_PUBLIC_ENV__?.siteUrl?.trim()
  )
}

export function ensureRuntimePublicEnv(configUrl: string): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve()
  if (hasCompleteRuntimePublicEnv()) {
    return Promise.resolve()
  }

  if (!runtimePublicEnvBootstrap) {
    runtimePublicEnvBootstrap = (async () => {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 8_000)
      try {
        const response = await fetch(configUrl, {
          credentials: 'same-origin',
          signal: controller.signal,
        })
        if (!response.ok) return

        const json = (await response.json()) as {
          anonKey?: string
          gotrueUrl?: string
          siteUrl?: string
          builderAppUrl?: string
          hcaptchaSiteKey?: string
        }
        window.__INDOBASE_PUBLIC_ENV__ = {
          ...window.__INDOBASE_PUBLIC_ENV__,
          ...(isUsableAnonKey(json.anonKey) ? { anonKey: json.anonKey!.trim() } : {}),
          ...(json.gotrueUrl?.trim() ? { gotrueUrl: json.gotrueUrl.trim() } : {}),
          ...(normalizePublicOrigin(json.siteUrl)
            ? { siteUrl: normalizePublicOrigin(json.siteUrl) }
            : {}),
          ...(normalizePublicOrigin(json.builderAppUrl)
            ? { builderAppUrl: normalizePublicOrigin(json.builderAppUrl) }
            : {}),
          ...(json.hcaptchaSiteKey?.trim()
            ? { hcaptchaSiteKey: json.hcaptchaSiteKey.trim() }
            : {}),
        }
      } catch {
        // Best-effort; auth may still work when build-time public env is correct.
      } finally {
        clearTimeout(timer)
      }
    })()
  }

  return runtimePublicEnvBootstrap
}
