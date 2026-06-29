import type { JwtPayload } from '@indobaseinc/indobase-js'
import { type User } from 'common/auth'
import { gotrueClient } from 'common/gotrue'

export const auth = gotrueClient

export const DEFAULT_FALLBACK_PATH = '/organizations'

const AUTH_FLOW_PATHS = new Set([
  '/sign-in',
  '/sign-in-mfa',
  '/sign-in-sso',
  '/sign-in-partner',
  '/sign-in-fly-tos',
  '/sign-up',
  '/forgot-password',
  '/forgot-password-mfa',
  '/reset-password',
  '/auth/confirm',
])

export const validateReturnTo = (
  returnTo: string,
  fallback: string = DEFAULT_FALLBACK_PATH
): string => {
  // Block protocol-relative URLs and external URLs
  if (returnTo.startsWith('//') || returnTo.includes('://')) {
    return fallback
  }

  const pathOnly = returnTo.split(/[?#]/, 1)[0]
  if (AUTH_FLOW_PATHS.has(pathOnly)) {
    return fallback
  }

  // For internal paths:
  // 1. Must start with /
  // 2. Only allow alphanumeric chars, slashes, hyphens, underscores
  // 3. For query params, also allow =, &, and ?
  // 4. For hash fragments, allow a constrained set (no / or protocol chars)
  const safePathPattern =
    /^\/[a-zA-Z0-9/\-_]*(?:\?[a-zA-Z0-9\-_=&]*)?(?:#[a-zA-Z0-9\-_=&]*)?$/
  return safePathPattern.test(returnTo) ? returnTo : fallback
}

export const getUserClaims = async (
  token: String
): Promise<{ error: any | null; claims: JwtPayload | null }> => {
  const accessToken = token.replace(/^bearer\s+/i, '')
  try {
    const { data, error } = await auth.getClaims(accessToken)
    if (error) throw error

    return { claims: data?.claims ?? null, error: null }
  } catch (err) {
    // Fallback for SaaS setups where NEXT_PUBLIC_GOTRUE_URL might not be set
    // (we still have SUPABASE_URL + SUPABASE_ANON_KEY in the backend stack).
    try {
      const anonKey =
        process.env.SUPABASE_ANON_KEY ??
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
        process.env.NEXT_PUBLIC_ANON_KEY
      const projectUrl = process.env.SUPABASE_URL

      const gotrueBaseUrl =
        // Prefer runtime server env to avoid build-time inlining issues.
        process.env.GOTRUE_URL ||
        process.env.NEXT_PUBLIC_GOTRUE_URL ||
        (projectUrl ? `${projectUrl.replace(/\/$/, '')}/auth/v1` : undefined)

      if (!anonKey || !gotrueBaseUrl) {
        console.error(err)
        return { claims: null, error: err }
      }

      const claimsUrl = `${gotrueBaseUrl.replace(/\/$/, '')}/claims`
      const r = await fetch(claimsUrl, {
        method: 'GET',
        headers: {
          apikey: anonKey,
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      })

      const json = await r.json().catch(() => null)
      if (!r.ok) {
        return { claims: null, error: json ?? err }
      }

      // auth-js typically returns { claims: <jwt> }
      const claims = json?.claims ?? json
      return { claims: (claims ?? null) as JwtPayload | null, error: null }
    } catch (fallbackErr) {
      console.error(fallbackErr)
      return { claims: null, error: fallbackErr }
    }
  }
}

export const getAuth0Id = (provider: String, providerId: String): String => {
  return `${provider}|${providerId}`
}

export const getIdentity = (gotrueUser: User) => {
  try {
    if (gotrueUser !== undefined && gotrueUser.identities !== undefined) {
      return { identity: gotrueUser.identities[0], error: null }
    }
    throw 'Missing identity'
  } catch (err) {
    return { identity: null, error: err }
  }
}

/**
 * Transfers the search params from the current location path to a newly built path
 */
export const buildPathWithParams = (pathname: string) => {
  const [basePath, existingParams] = pathname.split('?', 2)

  const pathnameSearchParams = new URLSearchParams(existingParams || '')

  // Merge the parameters, with pathname parameters taking precedence
  // over the current location's search parameters
  const mergedParams = new URLSearchParams(location.search)
  for (const [key, value] of pathnameSearchParams.entries()) {
    mergedParams.set(key, value)
  }

  const queryString = mergedParams.toString()
  return queryString ? `${basePath}?${queryString}` : basePath
}

export const getReturnToPath = (fallback = DEFAULT_FALLBACK_PATH) => {
  // If we're in a server environment, return the fallback
  if (typeof location === 'undefined') {
    return fallback
  }

  const searchParams = new URLSearchParams(location.search)

  let returnTo = searchParams.get('returnTo') ?? fallback

  if (process.env.NEXT_PUBLIC_BASE_PATH) {
    returnTo = returnTo.replace(process.env.NEXT_PUBLIC_BASE_PATH, '')
  }

  searchParams.delete('returnTo')

  const remainingSearchParams = searchParams.toString()
  const validReturnTo = validateReturnTo(returnTo, fallback)

  const [beforeHash, hashFragment] = validReturnTo.split('#', 2)
  const [path, existingQuery] = beforeHash.split('?', 2)

  const finalSearchParams = new URLSearchParams(existingQuery || '')

  // Add all remaining search params to the final search params
  if (remainingSearchParams) {
    const remainingParams = new URLSearchParams(remainingSearchParams)
    remainingParams.forEach((value, key) => {
      finalSearchParams.append(key, value)
    })
  }

  const finalQuery = finalSearchParams.toString()
  const finalHash = hashFragment ? `#${hashFragment}` : ''
  return path + (finalQuery ? `?${finalQuery}` : '') + finalHash
}
