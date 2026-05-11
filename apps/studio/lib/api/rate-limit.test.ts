import { afterEach, describe, expect, it } from 'vitest'
import { createMocks } from 'node-mocks-http'
import type { NextApiRequest, NextApiResponse } from 'next'

import { clearRateLimitStateForTests, enforceRateLimit } from './rate-limit'

describe('enforceRateLimit', () => {
  afterEach(() => {
    clearRateLimitStateForTests()
  })

  it('allows requests within the limit window', () => {
    for (let i = 0; i < 10; i += 1) {
      const { req, res } = createMocks({
        method: 'POST',
        headers: { 'x-forwarded-for': '203.0.113.10' },
      })

      const allowed = enforceRateLimit(req as unknown as NextApiRequest, res as unknown as NextApiResponse, {
        keyPrefix: 'signup',
        max: 10,
        windowMs: 60_000,
      })

      expect(allowed).toBe(true)
      expect(res._getStatusCode()).toBe(200)
    }
  })

  it('returns 429 with retry hints after limit is exceeded', () => {
    for (let i = 0; i < 10; i += 1) {
      const { req, res } = createMocks({
        method: 'POST',
        headers: { 'x-forwarded-for': '203.0.113.10' },
      })

      enforceRateLimit(req as unknown as NextApiRequest, res as unknown as NextApiResponse, {
        keyPrefix: 'signup',
        max: 10,
        windowMs: 60_000,
      })
    }

    const { req, res } = createMocks({
      method: 'POST',
      headers: { 'x-forwarded-for': '203.0.113.10' },
    })

    const allowed = enforceRateLimit(req as unknown as NextApiRequest, res as unknown as NextApiResponse, {
      keyPrefix: 'signup',
      max: 10,
      windowMs: 60_000,
    })

    expect(allowed).toBe(false)
    expect(res._getStatusCode()).toBe(429)
    expect(res.getHeader('Retry-After')).toBeTruthy()
    expect(res._getJSONData()).toMatchObject({
      error: {
        code: 'rate_limited',
      },
    })
  })
})
