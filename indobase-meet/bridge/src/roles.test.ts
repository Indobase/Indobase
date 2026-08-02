import assert from 'node:assert/strict'
import test from 'node:test'

import { meetRoleFromStudio } from './roles.js'

test('Studio owner maps to Meet Admin (moderator)', () => {
  assert.deepEqual(meetRoleFromStudio('owner'), { meetRole: 'Admin', isModerator: true })
})

test('Studio admin maps to Meet Moderator', () => {
  assert.deepEqual(meetRoleFromStudio('admin'), { meetRole: 'Moderator', isModerator: true })
})

test('Studio developer maps to Participant', () => {
  assert.deepEqual(meetRoleFromStudio('developer'), {
    meetRole: 'Participant',
    isModerator: false,
  })
})

test('Studio viewer maps to Viewer', () => {
  assert.deepEqual(meetRoleFromStudio('viewer'), { meetRole: 'Viewer', isModerator: false })
})
