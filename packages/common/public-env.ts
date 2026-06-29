declare global {
  interface Window {
    __INDOBASE_PUBLIC_ENV__?: {
      anonKey?: string
      gotrueUrl?: string
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

/**
 * Hydrate browser auth config from a runtime API when SSG HTML omitted anonKey.
 * Safe to call multiple times; deduped per page load.
 */
let runtimePublicEnvBootstrap: Promise<void> | null = null

export function ensureRuntimePublicEnv(configUrl: string): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve()
  if (isUsableAnonKey(window.__INDOBASE_PUBLIC_ENV__?.anonKey)) {
    return Promise.resolve()
  }

  if (!runtimePublicEnvBootstrap) {
    runtimePublicEnvBootstrap = (async () => {
      try {
        const response = await fetch(configUrl, { credentials: 'same-origin' })
        if (!response.ok) return

        const json = (await response.json()) as { anonKey?: string; gotrueUrl?: string }
        window.__INDOBASE_PUBLIC_ENV__ = {
          ...window.__INDOBASE_PUBLIC_ENV__,
          ...(isUsableAnonKey(json.anonKey) ? { anonKey: json.anonKey!.trim() } : {}),
          ...(json.gotrueUrl?.trim() ? { gotrueUrl: json.gotrueUrl.trim() } : {}),
        }
      } catch {
        // Best-effort; auth may still work when build-time public env is correct.
      }
    })()
  }

  return runtimePublicEnvBootstrap
}
