import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  authErrorJsonBody,
  extractPlatformErrorMessage,
  normalizeAuthRouteError,
} from './auth-errors.ts'

describe('auth-errors', () => {
  it('reads nested rate_limited error bodies from Studio', () => {
    const extracted = extractPlatformErrorMessage(
      {
        error: {
          code: 'rate_limited',
          message: 'Too many requests. Please try again later.',
          retryAfterSeconds: 42,
        },
      },
      'fallback',
    )
    assert.equal(extracted.code, 'rate_limited')
    assert.equal(extracted.retryAfterSeconds, 42)
    assert.match(extracted.message, /42/)
  })

  it('prefers top-level message when present', () => {
    const extracted = extractPlatformErrorMessage(
      { message: 'Accept DPDP consent', code: 'bad_request' },
      'fallback',
    )
    assert.equal(extracted.message, 'Accept DPDP consent')
    assert.equal(extracted.code, 'bad_request')
  })

  it('normalizes opaque start failures to friendly 502 copy', () => {
    const err = normalizeAuthRouteError(500, { message: 'smtp dial timeout' }, 'start')
    assert.equal(err.status, 502)
    assert.match(err.message, /verification email/i)
    assert.doesNotMatch(err.message, /smtp/i)
  })

  it('keeps invalid OTP messages on verify', () => {
    const err = normalizeAuthRouteError(400, { message: 'Invalid or expired verification code' }, 'verify')
    assert.equal(err.status, 400)
    assert.match(err.message, /Invalid or expired/i)
  })

  it('authErrorJsonBody includes retryAfterSeconds when set', () => {
    const body = authErrorJsonBody({
      message: 'wait',
      code: 'rate_limited',
      retryAfterSeconds: 12,
      status: 429,
    })
    assert.equal(body.code, 'rate_limited')
    assert.equal(body.retryAfterSeconds, 12)
    assert.equal(body.ok, false)
  })
})
