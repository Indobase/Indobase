import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  rewriteManagedBackendPath,
  rewriteManagedOtpVerifyBody,
} from './indobase-proxy.ts'

describe('indobase-proxy managed rewrites', () => {
  it('rewrites rest/v1 tables to physical collections', () => {
    assert.equal(
      rewriteManagedBackendPath('/rest/v1/products', 'abc123'),
      '/api/collections/ib_abc123_products/records',
    )
  })

  it('rewrites otp verify path to auth-with-otp', () => {
    assert.equal(
      rewriteManagedBackendPath('/auth/v1/otp/verify', 'abc123'),
      '/api/collections/users/auth-with-otp',
    )
  })

  it('maps token/otp body fields onto PocketBase password', () => {
    const out = rewriteManagedOtpVerifyBody(
      '/api/collections/users/auth-with-otp',
      JSON.stringify({ otpId: 'otp123', token: '654321' }),
    )
    assert.equal(out, JSON.stringify({ otpId: 'otp123', password: '654321' }))

    const out2 = rewriteManagedOtpVerifyBody(
      '/api/collections/users/auth-with-otp',
      JSON.stringify({ otp_id: 'otp9', otp: '111222' }),
    )
    assert.equal(out2, JSON.stringify({ otpId: 'otp9', password: '111222' }))
  })

  it('returns null for non-otp paths', () => {
    assert.equal(
      rewriteManagedOtpVerifyBody('/api/collections/users/records', '{"a":1}'),
      null,
    )
  })
})
