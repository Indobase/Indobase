import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildDiscussSpaceMap,
  discussChannelPath,
  discussSpaceKeyForProjectRef,
  discussTeamKeyForOrgSlug,
} from './space-map.js'

test('discussTeamKeyForOrgSlug is stable and sanitized', () => {
  assert.equal(discussTeamKeyForOrgSlug('Acme-Co'), 'ib-org-acme-co')
  assert.equal(discussTeamKeyForOrgSlug(''), 'ib-org-default')
})

test('discussSpaceKeyForProjectRef is stable and sanitized', () => {
  assert.equal(discussSpaceKeyForProjectRef('proj-ABC_123'), 'ib-proj-projabc123')
  assert.equal(discussSpaceKeyForProjectRef(''), 'ib-proj-default')
})

test('buildDiscussSpaceMap includes titles', () => {
  const map = buildDiscussSpaceMap({
    orgSlug: 'acme',
    projectRef: 'xyz123',
    projectName: 'My App',
    organizationName: 'Acme Inc',
  })
  assert.equal(map.teamTitle, 'Acme Inc')
  assert.equal(map.spaceTitle, 'My App')
  assert.equal(map.teamKey, 'ib-org-acme')
  assert.equal(map.spaceKey, 'ib-proj-xyz123')
  assert.equal(discussChannelPath(map), '/ib-org-acme/channels/ib-proj-xyz123')
})

test('buildDiscussSpaceMap titles stay human while keys stay stable', () => {
  const noNames = buildDiscussSpaceMap({ orgSlug: 'acme-co', projectRef: 'xyz123' })
  // Falls back to the slug/ref, humanized — never the internal ib-* key.
  assert.equal(noNames.teamTitle, 'Acme Co')
  assert.equal(noNames.spaceTitle, 'xyz123')
  assert.equal(noNames.teamKey, 'ib-org-acme-co')
  assert.equal(noNames.spaceKey, 'ib-proj-xyz123')

  const empty = buildDiscussSpaceMap({ orgSlug: '', projectRef: '' })
  assert.equal(empty.teamTitle, 'Organization')
  assert.equal(empty.spaceTitle, 'Project')

  // A key that somehow reaches the title is stripped, not rendered.
  const keyish = buildDiscussSpaceMap({
    orgSlug: 'acme',
    projectRef: 'xyz',
    projectName: 'ib-proj-92834',
  })
  assert.equal(keyish.spaceTitle, '92834')
  assert.equal(keyish.spaceKey, 'ib-proj-xyz')
})
