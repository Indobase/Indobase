import { describe, expect, it } from 'vitest'

import {
  OsIdentityError,
  osIdentityErrorStatus,
  validateOsIdentityStartInput,
  validateOsIdentityVerifyInput,
} from './os-identity-validate'

describe('os-identity validation', () => {
  it('requires name, email, and DPDP consent on start', () => {
    expect(() =>
      validateOsIdentityStartInput({ name: '', email: 'a@b.com', dpdpConsent: true }),
    ).toThrow(/name and valid email/i)

    expect(() =>
      validateOsIdentityStartInput({ name: 'Ada', email: 'not-an-email', dpdpConsent: true }),
    ).toThrow(/name and valid email/i)

    expect(() =>
      validateOsIdentityStartInput({ name: 'Ada', email: 'ada@indobase.in', dpdpConsent: false }),
    ).toThrow(/DPDP consent/i)

    expect(() => validateOsIdentityStartInput({ name: 'Ada', email: 'ada@indobase.in' })).toThrow(
      /DPDP consent/i,
    )

    const ok = validateOsIdentityStartInput({
      name: ' Ada Lovelace ',
      email: 'Ada@Indobase.in',
      dpdpConsent: true,
    })
    expect(ok).toEqual({ name: 'Ada Lovelace', email: 'ada@indobase.in' })
  })

  it('requires name, email, and token on verify', () => {
    expect(() =>
      validateOsIdentityVerifyInput({ name: 'Ada', email: 'ada@indobase.in', token: '' }),
    ).toThrow(/verification code/i)

    const ok = validateOsIdentityVerifyInput({
      name: 'Ada',
      email: 'Ada@Indobase.in',
      token: '123456',
    })
    expect(ok.email).toBe('ada@indobase.in')
    expect(ok.token).toBe('123456')
  })

  it('maps OsIdentityError status codes for API handlers', () => {
    expect(osIdentityErrorStatus(new OsIdentityError('consent', 400))).toBe(400)
    expect(osIdentityErrorStatus(new OsIdentityError('upstream', 502))).toBe(502)
    expect(osIdentityErrorStatus(new Error('name and valid email are required'))).toBe(400)
    expect(osIdentityErrorStatus(new Error('GoTrue unreachable'))).toBe(502)
  })
})
