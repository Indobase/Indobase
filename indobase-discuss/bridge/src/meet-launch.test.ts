import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildMeetStartCall,
  meetMeetingIdForChannel,
  meetMeetingIdForProjectRef,
} from './meet-launch.js'
import type { Session } from './auth.js'

const session: Session = {
  gotrueId: 'user-1',
  email: 'ada@example.com',
  projectRef: 'AbCd1234',
  orgSlug: 'acme',
  projectName: 'Demo',
  organizationName: 'Acme',
  role: 'developer',
  canPost: true,
  studioUrl: 'https://studio.indobase.in',
}

test('project and channel meeting ids are stable and branded', () => {
  assert.equal(meetMeetingIdForProjectRef('AbCd1234'), 'ib-meet-proj-abcd1234')
  assert.equal(
    meetMeetingIdForChannel('AbCd1234', 'channel-UUID-99'),
    'ib-meet-ch-abcd1234-channeluuid99'
  )
  const prev = process.env.MEET_HANDOFF_SECRET
  process.env.MEET_HANDOFF_SECRET = 'b'.repeat(32)
  const call = buildMeetStartCall(session, { channelId: 'town-square' })
  assert.equal(call.ready, true)
  assert.equal(call.scope, 'channel')
  assert.match(call.launchUrl || '', /meet\.indobase\.in\/sso\/launch/)
  assert.match(call.inviteUrl, /\/meeting\/ib-meet-ch-/)
  assert.doesNotMatch(JSON.stringify(call), /Jitsi|Mattermost/i)
  if (prev === undefined) delete process.env.MEET_HANDOFF_SECRET
  else process.env.MEET_HANDOFF_SECRET = prev
})
