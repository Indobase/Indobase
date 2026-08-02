import assert from 'node:assert/strict'
import test from 'node:test'

import type { Session } from './auth.js'
import { engineJwtConfigured, mintEngineRoomJwt, MEET_PRODUCT_NAME } from './jitsi-jwt.js'

const session: Session = {
  gotrueId: 'user-1',
  email: 'ada.lovelace@example.com',
  projectRef: 'proj1',
  orgSlug: 'acme',
  role: 'admin',
  meetRole: 'Moderator',
  isModerator: true,
  studioUrl: 'https://studio.indobase.in',
}

test('mintEngineRoomJwt when configured', () => {
  const prev = {
    id: process.env.JWT_APP_ID,
    secret: process.env.JWT_APP_SECRET,
  }
  process.env.JWT_APP_ID = 'indobase_meet'
  process.env.JWT_APP_SECRET = 's'.repeat(32)
  assert.equal(engineJwtConfigured(), true)
  const jwt = mintEngineRoomJwt({
    roomName: 'ib-meet-proj-proj1',
    session,
    subject: 'meet.indobase.in',
  })
  assert.ok(jwt && jwt.split('.').length === 3)
  assert.equal(MEET_PRODUCT_NAME, 'Indobase Meet')
  process.env.JWT_APP_ID = prev.id
  process.env.JWT_APP_SECRET = prev.secret
  if (prev.id === undefined) delete process.env.JWT_APP_ID
  if (prev.secret === undefined) delete process.env.JWT_APP_SECRET
})
