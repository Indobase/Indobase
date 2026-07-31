import assert from 'node:assert/strict'
import test from 'node:test'

import {
  meetMeetingIdForProjectRef,
  meetOrgKeyForOrgSlug,
  meetRoleFromStudio,
} from './meet-launch-shared'

test('meetOrgKeyForOrgSlug mirrors bridge', () => {
  assert.equal(meetOrgKeyForOrgSlug('Acme-Co'), 'ib-meet-org-acme-co')
  assert.equal(meetOrgKeyForOrgSlug(''), 'ib-meet-org-default')
})

test('meetMeetingIdForProjectRef mirrors bridge', () => {
  assert.equal(meetMeetingIdForProjectRef('proj-ABC_123'), 'ib-meet-proj-projabc123')
  assert.equal(meetMeetingIdForProjectRef(''), 'ib-meet-proj-default')
})

test('meetRoleFromStudio maps Owner→Admin … Viewer→Viewer', () => {
  assert.deepEqual(meetRoleFromStudio('owner'), { meetRole: 'Admin', isModerator: true })
  assert.deepEqual(meetRoleFromStudio('admin'), { meetRole: 'Moderator', isModerator: true })
  assert.deepEqual(meetRoleFromStudio('developer'), {
    meetRole: 'Participant',
    isModerator: false,
  })
  assert.deepEqual(meetRoleFromStudio('viewer'), { meetRole: 'Viewer', isModerator: false })
})
