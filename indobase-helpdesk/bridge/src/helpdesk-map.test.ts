import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildHelpdeskScopeMap,
  helpdeskQueueKeyForProjectRef,
  helpdeskTeamKeyForOrgSlug,
} from './helpdesk-map.js'

test('helpdeskTeamKeyForOrgSlug is stable and sanitized', () => {
  assert.equal(helpdeskTeamKeyForOrgSlug('Acme-Co'), 'ib-hd-org-acme-co')
  assert.equal(helpdeskTeamKeyForOrgSlug(''), 'ib-hd-org-default')
})

test('helpdeskQueueKeyForProjectRef is stable and sanitized', () => {
  assert.equal(helpdeskQueueKeyForProjectRef('proj-ABC_123'), 'ib-hd-proj-projabc123')
  assert.equal(helpdeskQueueKeyForProjectRef(''), 'ib-hd-proj-default')
})

test('buildHelpdeskScopeMap includes titles', () => {
  const map = buildHelpdeskScopeMap({
    orgSlug: 'acme',
    projectRef: 'xyz123',
    projectName: 'My App',
    organizationName: 'Acme Inc',
  })
  assert.equal(map.teamTitle, 'Acme Inc')
  assert.equal(map.queueTitle, 'My App')
  assert.equal(map.teamKey, 'ib-hd-org-acme')
  assert.equal(map.queueKey, 'ib-hd-proj-xyz123')
})
