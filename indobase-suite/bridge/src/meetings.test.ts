import assert from 'node:assert/strict'
import test from 'node:test'

import type { Session } from './auth.js'
import {
  buildMeetingsLaunchConfig,
  displayNameFromEmail,
  isMeetingsConfigured,
  meetingsJwtConfigured,
  meetingsRoomName,
} from './meetings.js'

const baseSession: Session = {
  gotrueId: 'user-1',
  email: 'ada.lovelace@example.com',
  projectRef: 'AbCd1234EfGh5678',
  orgSlug: 'acme',
  role: 'developer',
  canEdit: true,
  studioUrl: 'https://studio.indobase.in',
}

test('meetingsRoomName matches Meet space-map', () => {
  assert.equal(meetingsRoomName('proj1'), 'ib-meet-proj-proj1')
  assert.equal(meetingsRoomName('AbCd1234EfGh5678'), 'ib-meet-proj-abcd1234efgh5678')
  assert.equal(meetingsRoomName('bad room!!'), 'ib-meet-proj-badroom')
  assert.equal(meetingsRoomName(''), 'ib-meet-proj-default')
})

test('displayNameFromEmail uses local part', () => {
  assert.equal(displayNameFromEmail('ada.lovelace@example.com'), 'Ada Lovelace')
  assert.equal(displayNameFromEmail(''), 'Guest')
})

test('buildMeetingsLaunchConfig without Meet URL is not ready', () => {
  const prev = {
    meet: process.env.MEET_PUBLIC_URL,
    meetings: process.env.MEETINGS_PUBLIC_URL,
    secret: process.env.MEET_HANDOFF_SECRET,
  }
  delete process.env.MEET_PUBLIC_URL
  delete process.env.MEETINGS_PUBLIC_URL
  delete process.env.MEET_HANDOFF_SECRET

  assert.equal(isMeetingsConfigured(), false)
  const cfg = buildMeetingsLaunchConfig(baseSession)
  assert.equal(cfg.ready, false)
  assert.equal(cfg.productName, 'Indobase Meet')
  assert.equal(cfg.mode, 'unconfigured')
  assert.equal(cfg.meetingId, 'ib-meet-proj-abcd1234efgh5678')

  if (prev.meet !== undefined) process.env.MEET_PUBLIC_URL = prev.meet
  if (prev.meetings !== undefined) process.env.MEETINGS_PUBLIC_URL = prev.meetings
  if (prev.secret !== undefined) process.env.MEET_HANDOFF_SECRET = prev.secret
})

test('buildMeetingsLaunchConfig mints SSO launch URL', () => {
  const prev = {
    url: process.env.MEET_PUBLIC_URL,
    secret: process.env.MEET_HANDOFF_SECRET,
  }
  process.env.MEET_PUBLIC_URL = 'https://meet.indobase.in'
  process.env.MEET_HANDOFF_SECRET = 'm'.repeat(32)

  assert.equal(isMeetingsConfigured(), true)
  assert.equal(meetingsJwtConfigured(), true)
  const cfg = buildMeetingsLaunchConfig(baseSession)
  assert.equal(cfg.ready, true)
  assert.equal(cfg.mode, 'sso')
  assert.ok(cfg.launchUrl?.includes('/sso/launch'))
  assert.ok(cfg.launchUrl?.includes('token='))
  assert.equal(cfg.inviteUrl, 'https://meet.indobase.in/meeting/ib-meet-proj-abcd1234efgh5678')
  assert.doesNotMatch(JSON.stringify(cfg), /Jitsi/i)

  process.env.MEET_PUBLIC_URL = prev.url
  process.env.MEET_HANDOFF_SECRET = prev.secret
  if (prev.url === undefined) delete process.env.MEET_PUBLIC_URL
  if (prev.secret === undefined) delete process.env.MEET_HANDOFF_SECRET
})
