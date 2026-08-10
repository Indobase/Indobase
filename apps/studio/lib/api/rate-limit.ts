import type { NextApiRequest, NextApiResponse } from 'next'

type RateLimitOptions = {
  keyPrefix: string
  max: number
  windowMs: number
  /** When `identity`, bucket only by identityKey (e.g. email), not client IP. */
  scope?: 'ip' | 'identity'
  /** Used with scope=identity, or appended to IP bucket when scope is ip. */
  identityKey?: string | null
  /** Optional user-facing 429 message (defaults to generic too-many-requests). */
  message?: string
}

type RateLimitBucket = {
  count: number
  resetAt: number
}

const buckets = new Map<string, RateLimitBucket>()

function getClientIp(req: NextApiRequest) {
  const forwardedFor = req.headers['x-forwarded-for']
  if (typeof forwardedFor === 'string' && forwardedFor.length > 0) {
    return forwardedFor.split(',')[0].trim()
  }
  if (Array.isArray(forwardedFor) && forwardedFor.length > 0) {
    return forwardedFor[0].trim()
  }
  return req.socket.remoteAddress ?? 'unknown'
}

function pruneExpiredBuckets(now: number) {
  for (const [key, value] of buckets.entries()) {
    if (value.resetAt <= now) {
      buckets.delete(key)
    }
  }
}

export function enforceRateLimit(
  req: NextApiRequest,
  res: NextApiResponse,
  options: RateLimitOptions
): boolean {
  const now = Date.now()
  pruneExpiredBuckets(now)

  const clientIp = getClientIp(req)
  const identity = options.identityKey?.trim().toLowerCase()
  const bucketKey =
    options.scope === 'identity'
      ? `${options.keyPrefix}:${identity || 'unknown'}`
      : identity
        ? `${options.keyPrefix}:${clientIp}:${identity}`
        : `${options.keyPrefix}:${clientIp}`
  const current = buckets.get(bucketKey)

  if (!current || current.resetAt <= now) {
    buckets.set(bucketKey, { count: 1, resetAt: now + options.windowMs })
    return true
  }

  current.count += 1
  if (current.count <= options.max) {
    buckets.set(bucketKey, current)
    return true
  }

  const retryAfterSeconds = Math.max(1, Math.ceil((current.resetAt - now) / 1000))
  const message =
    options.message?.trim() || 'Too many requests. Please try again later.'
  res.setHeader('Retry-After', String(retryAfterSeconds))
  // Top-level message + code for OS bridge / OTP clients; nested error kept for older callers.
  res.status(429).json({
    ok: false,
    message,
    code: 'rate_limited',
    retryAfterSeconds,
    error: {
      code: 'rate_limited',
      message,
      retryAfterSeconds,
    },
  })
  return false
}

export function clearRateLimitStateForTests() {
  buckets.clear()
}

/** IP + per-email limits for public auth endpoints (signup, password reset). */
export function enforcePublicAuthRateLimits(
  req: NextApiRequest,
  res: NextApiResponse,
  options: {
    keyPrefix: string
    ipMax: number
    ipWindowMs: number
    email?: string | null
    /** Optional copy for OTP / auth chrome clients. */
    message?: string
  }
): boolean {
  if (
    !enforceRateLimit(req, res, {
      keyPrefix: options.keyPrefix,
      max: options.ipMax,
      windowMs: options.ipWindowMs,
      message: options.message,
    })
  ) {
    return false
  }

  const email = options.email?.trim().toLowerCase()
  if (!email) return true

  return enforceRateLimit(req, res, {
    keyPrefix: `${options.keyPrefix}-email`,
    max: 5,
    windowMs: 15 * 60_000,
    scope: 'identity',
    identityKey: email,
    message:
      options.message ||
      'Too many verification attempts for this email. Please wait a few minutes and try again.',
  })
}
