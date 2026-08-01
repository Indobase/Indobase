import assert from 'node:assert/strict'
import test from 'node:test'

import {
  hasFrappeSid,
  mintStudioHandoffToken,
  verifyStudioHandoff,
  type Session,
} from './auth.js'

const SECRET = 'a'.repeat(32)

const session: Session = {
  gotrueId: 'user-1',
  email: 'owner@example.com',
  projectRef: 'projref1',
  orgSlug: 'acme',
  projectName: 'Acme CRM',
  organizationName: 'Acme',
  role: 'owner',
  canEdit: true,
  studioUrl: 'https://studio.indobase.in',
}

test('mintStudioHandoffToken is verifiable as a Studio handoff JWT', () => {
  const token = mintStudioHandoffToken(session, SECRET, 120)
  const claims = verifyStudioHandoff(token, SECRET)
  assert.ok(claims)
  assert.equal(claims.sub, 'user-1')
  assert.equal(claims.email, 'owner@example.com')
  assert.equal(claims.project_ref, 'projref1')
  assert.equal(claims.organization_slug, 'acme')
  assert.equal(claims.role, 'owner')
  assert.equal(claims.aud, 'indobase-crm')
})

test('hasFrappeSid detects a real sid cookie', () => {
  assert.equal(hasFrappeSid('sid=abc123; user_id=a%40b.com'), true)
  assert.equal(hasFrappeSid('user_id=a%40b.com'), false)
  assert.equal(hasFrappeSid('sid=Guest'), false)
  assert.equal(hasFrappeSid(undefined), false)
})
