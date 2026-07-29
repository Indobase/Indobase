import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { test } from 'node:test'

import {
  createSessionToken,
  readSessionToken,
  resolveHandoffSecret,
  verifyStudioHandoff,
} from './auth.js'

const SECRET = 'test-domains-handoff-secret-32chars!!'

process.env.DOMAINS_HANDOFF_SECRET = SECRET

function b64url(input: string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

test('verifyStudioHandoff accepts valid token', () => {
  const now = Math.floor(Date.now() / 1000)
  const claims = {
    aud: 'indobase-domains',
    sub: 'user-1',
    email: 'dev@indobase.in',
    project_ref: 'abc123',
    organization_slug: 'acme',
    role: 'owner',
    exp: now + 300,
    iat: now,
  }

  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const payload = b64url(JSON.stringify(claims))
  const sig = createHmac('sha256', SECRET)
    .update(`${header}.${payload}`)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
  const token = `${header}.${payload}.${sig}`

  const verified = verifyStudioHandoff(token, SECRET)
  assert.ok(verified)
  assert.equal(verified?.project_ref, 'abc123')
})

test('session roundtrip', () => {
  const secret = resolveHandoffSecret()
  const now = Math.floor(Date.now() / 1000)
  const token = createSessionToken(
    {
      sub: 'user-1',
      email: 'dev@indobase.in',
      project_ref: 'abc123',
      organization_slug: 'acme',
      role: 'owner',
      exp: now + 300,
      iat: now,
      aud: 'indobase-domains',
    },
    secret
  )
  const session = readSessionToken(token, secret)
  assert.ok(session)
  assert.equal(session?.projectRef, 'abc123')
})
