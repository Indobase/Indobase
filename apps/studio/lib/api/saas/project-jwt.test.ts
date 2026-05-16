import { describe, expect, it, vi } from 'vitest'

import { makeProjectJwt, resolveProjectJwtSecret } from './project-jwt'

describe('project-jwt', () => {
  it('makeProjectJwt produces a three-part HS256 token', () => {
    const secret = 'super-secret-jwt-token-with-at-least-32-characters-long'
    const token = makeProjectJwt(secret, 'anon', 'test-ref')
    expect(token.split('.')).toHaveLength(3)
  })

  it('resolveProjectJwtSecret falls back to env when no per-project secret', () => {
    vi.stubEnv('AUTH_JWT_SECRET', 'super-secret-jwt-token-with-at-least-32-characters-long')
    expect(resolveProjectJwtSecret(null)).toBe(
      'super-secret-jwt-token-with-at-least-32-characters-long'
    )
    vi.unstubAllEnvs()
  })
})
