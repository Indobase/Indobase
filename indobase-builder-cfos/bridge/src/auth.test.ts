import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { describe, it } from 'node:test'

import {
  AUDIENCE,
  claimsToSession,
  clearSessionCookie,
  createSessionToken,
  profileDisplayName,
  readSessionToken,
  verifyStudioHandoff,
} from './auth.ts'

function b64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

function sign(payload: Record<string, unknown>, secret: string): string {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const body = b64url(JSON.stringify(payload))
  const data = `${header}.${body}`
  const sig = createHmac('sha256', secret).update(data).digest()
  return `${data}.${b64url(sig)}`
}

const SECRET = 'x'.repeat(32)

describe('builder-cfos auth', () => {
  it('accepts a valid Studio handoff', () => {
    const now = Math.floor(Date.now() / 1000)
    const token = sign(
      {
        aud: AUDIENCE,
        sub: 'user-1',
        email: 'ops@indobase.in',
        project_ref: 'proj_demo',
        organization_slug: 'acme',
        project_name: 'Demo',
        studio_url: 'https://studio.indobase.in',
        backend: {
          anon_key: 'anon',
          api_url: 'https://proj_demo.indobase.in',
          auth_url: 'https://proj_demo.indobase.in/auth/v1',
          project_name: 'Demo',
          project_ref: 'proj_demo',
          project_url: 'https://studio.indobase.in/project/proj_demo/backend',
          rest_url: 'https://proj_demo.indobase.in/rest/v1/',
          storage_url: 'https://proj_demo.indobase.in/storage/v1',
        },
        iat: now,
        exp: now + 300,
      },
      SECRET
    )

    const claims = verifyStudioHandoff(token, SECRET)
    assert.ok(claims)
    assert.equal(claims.project_ref, 'proj_demo')
    assert.equal(claims.backend?.anon_key, 'anon')

    const session = claimsToSession(claims)
    const sessionToken = createSessionToken(session, SECRET)
    const restored = readSessionToken(sessionToken, SECRET)
    assert.ok(restored)
    assert.equal(restored.email, 'ops@indobase.in')
    assert.equal(restored.displayName, 'ops')
    assert.equal(restored.backend?.api_url, 'https://proj_demo.indobase.in')
  })

  it('keeps OTP displayName on session round-trip', () => {
    const sessionToken = createSessionToken(
      {
        gotrueId: 'user-2',
        email: 'ada@indobase.in',
        projectRef: 'proj_ada',
        orgSlug: 'ada',
        displayName: 'Ada Lovelace',
        studioUrl: 'https://studio.indobase.in',
      },
      SECRET,
    )
    const restored = readSessionToken(sessionToken, SECRET)
    assert.ok(restored)
    assert.equal(restored.displayName, 'Ada Lovelace')
    assert.equal(profileDisplayName(restored), 'Ada Lovelace')
  })

  it('rejects wrong audience', () => {
    const now = Math.floor(Date.now() / 1000)
    const token = sign(
      {
        aud: 'indobase-builder',
        sub: 'user-1',
        email: 'ops@indobase.in',
        project_ref: 'proj_demo',
        iat: now,
        exp: now + 300,
      },
      SECRET
    )
    assert.equal(verifyStudioHandoff(token, SECRET), null)
  })

  it('clearSessionCookie mirrors Secure in production', () => {
    const prev = process.env.NODE_ENV
    const prevForce = process.env.FORCE_SECURE_COOKIES
    process.env.NODE_ENV = 'production'
    delete process.env.FORCE_SECURE_COOKIES
    assert.match(clearSessionCookie(), /Secure/)
    process.env.NODE_ENV = 'development'
    process.env.FORCE_SECURE_COOKIES = '1'
    assert.match(clearSessionCookie(), /Secure/)
    process.env.NODE_ENV = prev
    if (prevForce === undefined) delete process.env.FORCE_SECURE_COOKIES
    else process.env.FORCE_SECURE_COOKIES = prevForce
  })
})
