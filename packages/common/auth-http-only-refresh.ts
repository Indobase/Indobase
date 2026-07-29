import type { SupportedStorage } from '@indobaseinc/auth-js'

/** Sentinel stored in session storage; actual refresh token lives in an HttpOnly cookie. */
export const HTTP_ONLY_REFRESH_SENTINEL = '__indobase_http_only_refresh__'

export const STUDIO_REFRESH_COOKIE_API = '/api/platform/auth/refresh-cookie'
export const STUDIO_REFRESH_SESSION_API = '/api/platform/auth/refresh-session'

const isBrowser = () => typeof window !== 'undefined'

function resolveBasePath(): string {
  if (!isBrowser()) return ''
  return process.env.NEXT_PUBLIC_BASE_PATH ?? ''
}

function resolveRefreshCookieApi(): string {
  return `${resolveBasePath()}${STUDIO_REFRESH_COOKIE_API}`
}

function resolveRefreshSessionApi(): string {
  return `${resolveBasePath()}${STUDIO_REFRESH_SESSION_API}`
}

function stripRefreshToken(value: string): { stored: string; refreshToken: string | null } {
  try {
    const parsed = JSON.parse(value)
    if (!parsed || typeof parsed !== 'object') {
      return { stored: value, refreshToken: null }
    }

    const refreshToken =
      typeof parsed.refresh_token === 'string' && parsed.refresh_token !== HTTP_ONLY_REFRESH_SENTINEL
        ? parsed.refresh_token
        : null

    if (refreshToken) {
      parsed.refresh_token = HTTP_ONLY_REFRESH_SENTINEL
    }

    return { stored: JSON.stringify(parsed), refreshToken }
  } catch {
    return { stored: value, refreshToken: null }
  }
}

function withRefreshSentinel(value: string): string {
  try {
    const parsed = JSON.parse(value)
    if (!parsed || typeof parsed !== 'object') return value
    if (!parsed.refresh_token) {
      parsed.refresh_token = HTTP_ONLY_REFRESH_SENTINEL
    }
    return JSON.stringify(parsed)
  } catch {
    return value
  }
}

async function syncRefreshCookie(refreshToken: string | null, method: 'POST' | 'DELETE') {
  if (!isBrowser()) return

  try {
    await fetch(resolveRefreshCookieApi(), {
      method,
      credentials: 'include',
      headers: method === 'POST' ? { 'Content-Type': 'application/json' } : undefined,
      body: method === 'POST' ? JSON.stringify({ refresh_token: refreshToken }) : undefined,
    })
  } catch (error) {
    console.warn('[auth] Failed to sync HttpOnly refresh cookie', error)
  }
}

/**
 * Session storage adapter that keeps refresh tokens out of JavaScript-readable storage.
 * Refresh tokens are mirrored to an HttpOnly cookie via Studio API routes.
 */
export function createHttpOnlyRefreshStorage(
  storage: Storage,
  options?: { storageKey?: string }
): SupportedStorage {
  const storageKey = options?.storageKey

  return {
    getItem: (key: string) => {
      const value = storage.getItem(key)
      if (!value) return value
      if (storageKey && key !== storageKey) return value
      return withRefreshSentinel(value)
    },
    setItem: (key: string, value: string) => {
      if (storageKey && key !== storageKey) {
        storage.setItem(key, value)
        return
      }

      const { stored, refreshToken } = stripRefreshToken(value)
      storage.setItem(key, stored)

      if (refreshToken) {
        void syncRefreshCookie(refreshToken, 'POST')
      }
    },
    removeItem: (key: string) => {
      storage.removeItem(key)
      if (!storageKey || key === storageKey) {
        void syncRefreshCookie(null, 'DELETE')
      }
    },
  }
}

/** Migrate legacy localStorage sessions to sessionStorage + HttpOnly refresh cookie. */
export function migrateLegacyAuthStorage(storageKey: string) {
  if (!isBrowser()) return

  try {
    const legacy = window.localStorage.getItem(storageKey)
    if (!legacy) return

    const { stored, refreshToken } = stripRefreshToken(legacy)
    window.sessionStorage.setItem(storageKey, stored)
    window.localStorage.removeItem(storageKey)

    if (refreshToken) {
      void syncRefreshCookie(refreshToken, 'POST')
    }
  } catch (error) {
    console.warn('[auth] Failed to migrate legacy auth storage', error)
  }
}

/**
 * Intercepts GoTrue refresh calls so the HttpOnly cookie is used server-side
 * instead of posting the sentinel refresh token to GoTrue directly.
 */
export function createHttpOnlyRefreshFetch(baseFetch: typeof fetch = fetch): typeof fetch {
  return async (input, init) => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : 'url' in input
            ? input.url
            : ''

    if (url.includes('/token?grant_type=refresh_token')) {
      return baseFetch(resolveRefreshSessionApi(), {
        method: 'POST',
        credentials: 'include',
        headers: {
          Accept: 'application/json',
          ...(init?.headers as Record<string, string> | undefined),
        },
      })
    }

    return baseFetch(input, init)
  }
}
