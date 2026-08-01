import assert from 'node:assert/strict'
import test from 'node:test'

import { createSessionToken, readSessionToken, resolveHandoffSecret, verifyStudioHandoff } from './auth.js'
import { createHmac } from 'node:crypto'

function b64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

function mintStudioToken(secret: string, overrides: Record<string, unknown> = {}): string {
  const now = Math.floor(Date.now() / 1000)
  const payload = {
    sub: 'user-1',
    email: 'ada@example.com',
    project_ref: 'proj1',
    organization_slug: 'acme',
    organization_name: 'Acme',
    project_name: 'Demo',
    role: 'owner',
    studio_url: 'https://studio.indobase.in',
    aud: 'indobase-meet',
    iat: now,
    exp: now + 300,
    ...overrides,
  }
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const body = b64url(JSON.stringify(payload))
  const sig = createHmac('sha256', secret).update(`${header}.${body}`).digest()
  return `${header}.${body}.${b64url(sig)}`
}

test('verifyStudioHandoff accepts aud=indobase-meet', () => {
  const secret = 'x'.repeat(32)
  process.env.MEET_HANDOFF_SECRET = secret
  assert.equal(resolveHandoffSecret(), secret)
  const claims = verifyStudioHandoff(mintStudioToken(secret), secret)
  assert.ok(claims)
  assert.equal(claims!.aud, 'indobase-meet')
  assert.equal(claims!.role, 'owner')
})

test('verifyStudioHandoff rejects wrong audience', () => {
  const secret = 'y'.repeat(32)
  const token = mintStudioToken(secret, { aud: 'indobase-discuss' })
  assert.equal(verifyStudioHandoff(token, secret), null)
})

test('session round-trip maps owner to Admin moderator', () => {
  const secret = 'z'.repeat(32)
  const claims = verifyStudioHandoff(mintStudioToken(secret), secret)!
  const session = readSessionToken(createSessionToken(claims, secret), secret)
  assert.ok(session)
  assert.equal(session!.meetRole, 'Admin')
  assert.equal(session!.isModerator, true)
})
