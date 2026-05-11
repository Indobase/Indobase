import type { NextApiRequest, NextApiResponse } from 'next'

type RateLimitOptions = {
  keyPrefix: string
  max: number
  windowMs: number
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
  const bucketKey = `${options.keyPrefix}:${clientIp}`
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
  res.setHeader('Retry-After', String(retryAfterSeconds))
  res.status(429).json({
    error: {
      code: 'rate_limited',
      message: 'Too many requests. Please try again later.',
      retryAfterSeconds,
    },
  })
  return false
}

export function clearRateLimitStateForTests() {
  buckets.clear()
}
