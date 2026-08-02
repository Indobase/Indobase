import { describe, expect, it } from 'vitest'

import { assertUserScopedToken, decodeJwtClaims } from './discuss-access-token'

function b64url(obj: unknown) {
  return Buffer.from(JSON.stringify(obj))
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
}

function fakeJwt(claims: Record<string, unknown>) {
  return `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url(claims)}.sig`
}

describe('discuss-access-token', () => {
  it('decodeJwtClaims reads the payload', () => {
    const token = fakeJwt({ role: 'authenticated', sub: 'abc' })
    expect(decodeJwtClaims(token)).toEqual({ role: 'authenticated', sub: 'abc' })
  })

  it('assertUserScopedToken accepts matching authenticated tokens', () => {
    const gotrueId = '11111111-1111-1111-1111-111111111111'
    const token = fakeJwt({
      role: 'authenticated',
      sub: gotrueId,
      aud: 'authenticated',
      project_ref: 'proj_a',
    })
    expect(assertUserScopedToken(token, gotrueId, 'proj_a')).toBe(token)
  })

  it('assertUserScopedToken refuses service_role', () => {
    const gotrueId = '11111111-1111-1111-1111-111111111111'
    const token = fakeJwt({ role: 'service_role', sub: gotrueId })
    expect(() => assertUserScopedToken(token, gotrueId)).toThrow(/service_role/)
  })

  it('assertUserScopedToken refuses a different sub', () => {
    const token = fakeJwt({
      role: 'authenticated',
      sub: '22222222-2222-2222-2222-222222222222',
      project_ref: 'proj_a',
    })
    expect(() =>
      assertUserScopedToken(token, '11111111-1111-1111-1111-111111111111')
    ).toThrow(/different user/)
  })

  it('assertUserScopedToken refuses a mismatched project_ref', () => {
    const gotrueId = '11111111-1111-1111-1111-111111111111'
    const token = fakeJwt({
      role: 'authenticated',
      sub: gotrueId,
      project_ref: 'proj_a',
    })
    expect(() => assertUserScopedToken(token, gotrueId, 'proj_b')).toThrow(/project_ref/)
  })

  it('assertUserScopedToken refuses a missing project_ref when required', () => {
    const gotrueId = '11111111-1111-1111-1111-111111111111'
    const token = fakeJwt({ role: 'authenticated', sub: gotrueId })
    expect(() => assertUserScopedToken(token, gotrueId, 'proj_a')).toThrow(/without a project_ref/)
  })
})
