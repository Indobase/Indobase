import assert from 'node:assert/strict'
import test from 'node:test'

import {
  acceptMeetEvent,
  acceptRoomLinkEvent,
  getLinkedRoom,
  isMeetEventEnvelope,
  linkMeetRoom,
} from './events.js'

test('event envelope validation', () => {
  assert.equal(isMeetEventEnvelope(null), false)
  assert.equal(isMeetEventEnvelope({}), false)
  assert.equal(isMeetEventEnvelope({ type: 'meet.joined' }), true)
  assert.deepEqual(acceptMeetEvent({ type: 'x' }), {
    ok: true,
    accepted: true,
    deferred: true,
  })
})

test('room link registry stores calendar attach', () => {
  const room = linkMeetRoom({
    meetingId: 'ib-meet-proj-abcd',
    projectRef: 'AbCd',
    source: 'calendar',
    scope: 'project',
    inviteUrl: 'https://meet.indobase.in/meeting/ib-meet-proj-abcd',
  })
  assert.equal(room.meetingId, 'ib-meet-proj-abcd')
  assert.equal(getLinkedRoom('ib-meet-proj-abcd')?.source, 'calendar')
  const accepted = acceptRoomLinkEvent({
    type: 'discuss.call.started',
    meetingId: 'ib-meet-ch-abcd-townsquare',
    projectRef: 'AbCd',
    payload: { source: 'discuss', scope: 'channel' },
  })
  assert.equal(accepted.deferred, false)
  assert.equal(accepted.room.source, 'discuss')
  assert.doesNotMatch(JSON.stringify(accepted), /Jitsi/i)
})
