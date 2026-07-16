import crypto from 'node:crypto'

import { describe, expect, it, vi } from 'vitest'

import {
  generateProjectJwtSecret,
  makeProjectJwt,
  normalizeProjectApiKey,
  resolveProjectJwtSecret,
} from './project-jwt'

/** Mirrors how tenant GoTrue/PostgREST verify: signature only. */
function signatureVerifies(token: string, secret: string): boolean {
  const [header, payload, sig] = token.split('.')
  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${header}.${payload}`)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
  return sig === expected
}

describe('project-jwt', () => {
  it('makeProjectJwt produces a three-part HS256 token', () => {
    const secret = 'super-secret-jwt-token-with-at-least-32-characters-long'
    const token = makeProjectJwt(secret, 'anon', 'test-ref')
    expect(token.split('.')).toHaveLength(3)
  })

  /**
   * Regression guard for the shared-signing-key incident: every project must get its own secret.
   * Tenants verify only the signature (the project_ref claim is not enforced), so if two projects
   * ever share a secret, each accepts the other's anon/service keys — a cross-tenant read.
   * See docs/SECURITY-ADVISORY-shared-jwt-secret.md
   */
  it('generateProjectJwtSecret issues a unique, sufficiently long secret per project', () => {
    const a = generateProjectJwtSecret()
    const b = generateProjectJwtSecret()

    expect(a).not.toBe(b)
    // updateProjectJwtSecret() rejects anything shorter than 32.
    expect(a.length).toBeGreaterThanOrEqual(32)
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/)
  })

  it("one project's anon key must NOT validate against another project's secret", () => {
    const secretA = generateProjectJwtSecret()
    const secretB = generateProjectJwtSecret()

    const anonA = makeProjectJwt(secretA, 'anon', 'proj_a')

    expect(signatureVerifies(anonA, secretA)).toBe(true)
    // The whole point: cross-tenant use is rejected at the signature.
    expect(signatureVerifies(anonA, secretB)).toBe(false)
  })

  it('normalizeProjectApiKey prepends header to 2-part legacy tokens', () => {
    const secret = 'super-secret-jwt-token-with-at-least-32-characters-long'
    const full = makeProjectJwt(secret, 'anon', 'test-ref')
    const [, payload, sig] = full.split('.')
    const repaired = normalizeProjectApiKey(`${payload}.${sig}`, secret, 'anon', 'test-ref')
    expect(repaired.split('.')).toHaveLength(3)
    expect(repaired).toBe(full)
  })

  it('resolveProjectJwtSecret falls back to env when no per-project secret', () => {
    vi.stubEnv('AUTH_JWT_SECRET', 'super-secret-jwt-token-with-at-least-32-characters-long')
    expect(resolveProjectJwtSecret(null)).toBe(
      'super-secret-jwt-token-with-at-least-32-characters-long'
    )
    vi.unstubAllEnvs()
  })
})
