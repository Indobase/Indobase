import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildMeetSpaceMap,
  meetMeetingIdForProjectRef,
  meetMeetingPath,
  meetOrgKeyForOrgSlug,
} from './space-map.js'

test('meetOrgKeyForOrgSlug is stable and sanitized', () => {
  assert.equal(meetOrgKeyForOrgSlug('Acme-Co'), 'ib-meet-org-acme-co')
  assert.equal(meetOrgKeyForOrgSlug(''), 'ib-meet-org-default')
})

test('meetMeetingIdForProjectRef is stable and sanitized', () => {
  assert.equal(meetMeetingIdForProjectRef('proj-ABC_123'), 'ib-meet-proj-projabc123')
  assert.equal(meetMeetingIdForProjectRef(''), 'ib-meet-proj-default')
})

test('buildMeetSpaceMap includes titles and path', () => {
  const map = buildMeetSpaceMap({
    orgSlug: 'acme',
    projectRef: 'xyz123',
    projectName: 'My App',
    organizationName: 'Acme Inc',
  })
  assert.equal(map.orgTitle, 'Acme Inc')
  assert.equal(map.meetingTitle, 'My App')
  assert.equal(map.orgKey, 'ib-meet-org-acme')
  assert.equal(map.meetingId, 'ib-meet-proj-xyz123')
  assert.equal(meetMeetingPath(map), '/meeting/ib-meet-proj-xyz123')
})
