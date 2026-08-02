import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildDiscussSpaceMap,
  discussSpaceKeyForProjectRef,
  discussTeamKeyForOrgSlug,
  gameplanSpacePath,
  gameplanSpacePathForDocs,
  humanizeTitle,
  rewriteLegacyGameplanPath,
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
  assert.equal(gameplanSpacePath(map), '/g/community/ib-org-acme')
  assert.equal(gameplanSpacePathForDocs('ib-org-acme', '6'), '/g/community/ib-org-acme/space/6')
})

test('rewriteLegacyGameplanPath upgrades obsolete /g/:team/:space bookmarks', () => {
  assert.equal(
    rewriteLegacyGameplanPath('/g/ib-org-adral-dudmvimg/4'),
    '/g/community/ib-org-adral-dudmvimg/space/4'
  )
  assert.equal(rewriteLegacyGameplanPath('/g/community/ib-org-adral/space/6'), null)
  assert.equal(rewriteLegacyGameplanPath('/g/ib-org-adral/projects/6'), null)
  assert.equal(rewriteLegacyGameplanPath('/g/ib-org-adral'), null)
})

test('buildDiscussSpaceMap titles stay human while keys stay stable', () => {
  const noNames = buildDiscussSpaceMap({ orgSlug: 'acme-co', projectRef: 'xyz123' })
  assert.equal(noNames.teamTitle, 'Acme Co')
  assert.equal(noNames.spaceTitle, 'xyz123')
  assert.equal(noNames.teamKey, 'ib-org-acme-co')
  assert.equal(noNames.spaceKey, 'ib-proj-xyz123')

  const empty = buildDiscussSpaceMap({ orgSlug: '', projectRef: '' })
  assert.equal(empty.teamTitle, 'Organization')
  assert.equal(empty.spaceTitle, 'Project')

  const keyish = buildDiscussSpaceMap({
    orgSlug: 'acme',
    projectRef: 'xyz',
    projectName: 'ib-proj-92834',
  })
  assert.equal(keyish.spaceTitle, '92834')
  assert.equal(keyish.spaceKey, 'ib-proj-xyz')
})

test('humanizeTitle strips internal keys', () => {
  assert.equal(humanizeTitle('ib-org-acme', 'Organization'), 'acme')
  assert.equal(humanizeTitle('', 'Organization'), 'Organization')
})
