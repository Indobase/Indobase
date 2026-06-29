declare global {
  interface Window {
    __INDOBASE_PUBLIC_ENV__?: {
      anonKey?: string
      gotrueUrl?: string
    }
  }
}

/**
 * Public anon key for Kong / GoTrue. CI bakes `NEXT_PUBLIC_ANON_KEY` at build time;
 * production Studio also sets `NEXT_PUBLIC_SUPABASE_ANON_KEY` at runtime. Prefer the
 * injected window config (from _document) so split-deploy images work without rebuild.
 */
export function resolvePublicAnonKey(): string {
  if (typeof window !== 'undefined') {
    const injected = window.__INDOBASE_PUBLIC_ENV__?.anonKey?.trim()
    if (injected) return injected
  }

  return (
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_ANON_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.ANON_KEY ||
    ''
  ).trim()
}

export function resolvePublicGotrueUrl(): string | undefined {
  if (typeof window !== 'undefined') {
    const injected = window.__INDOBASE_PUBLIC_ENV__?.gotrueUrl?.trim()
    if (injected) return injected
  }

  const fromEnv =
    process.env.NEXT_PUBLIC_GOTRUE_URL ||
    process.env.GOTRUE_URL ||
    process.env.KONG_INTERNAL_GOTRUE_URL

  return fromEnv?.trim() || undefined
}
