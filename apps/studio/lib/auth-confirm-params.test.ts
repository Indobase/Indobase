import { describe, expect, it } from 'vitest'

import {
  readAuthConfirmTokenHash,
  readAuthConfirmType,
  resolveAuthConfirmNextPath,
} from './auth-confirm-params'

describe('auth-confirm-params', () => {
  it('reads token_hash and falls back to token', () => {
    expect(readAuthConfirmTokenHash({ token_hash: 'abc' })).toBe('abc')
    expect(readAuthConfirmTokenHash({ token: 'def' })).toBe('def')
    expect(readAuthConfirmTokenHash({ token_hash: 'abc', token: 'def' })).toBe('abc')
  })

  it('parses known otp types', () => {
    expect(readAuthConfirmType({ type: 'recovery' })).toBe('recovery')
    expect(readAuthConfirmType({ type: 'signup' })).toBe('signup')
    expect(readAuthConfirmType({ type: 'not-real' })).toBeNull()
  })

  it('resolves redirect_to on same origin to a relative path', () => {
    expect(
      resolveAuthConfirmNextPath(
        { redirect_to: 'https://studio.indobase.in/reset-password' },
        'recovery',
        'https://studio.indobase.in'
      )
    ).toBe('/reset-password')
  })

  it('defaults recovery to reset-password', () => {
    expect(resolveAuthConfirmNextPath({}, 'recovery', 'https://studio.indobase.in')).toBe(
      '/reset-password'
    )
  })
})
