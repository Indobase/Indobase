import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildWorkspaceMap,
  workspaceHomePath,
  workspaceProjectKeyForProjectRef,
  workspaceTeamKeyForOrgSlug,
} from './workspace-map.js'
import { modulePath } from './modules.js'

test('workspaceTeamKeyForOrgSlug is deterministic', () => {
  assert.equal(workspaceTeamKeyForOrgSlug('Acme-Co'), workspaceTeamKeyForOrgSlug('acme-co'))
  assert.match(workspaceTeamKeyForOrgSlug('acme'), /^ib-ws-org-/)
})

test('workspaceProjectKeyForProjectRef is deterministic', () => {
  assert.equal(workspaceProjectKeyForProjectRef('AbC123'), workspaceProjectKeyForProjectRef('abc123'))
  assert.match(workspaceProjectKeyForProjectRef('xyz'), /^ib-ws-proj-/)
})

test('buildWorkspaceMap produces stable deep links', () => {
  const map = buildWorkspaceMap({
    orgSlug: 'acme',
    projectRef: 'proj1',
    projectName: 'My App',
    organizationName: 'Acme Inc',
  })
  assert.equal(map.teamTitle, 'Acme Inc')
  assert.equal(map.projectTitle, 'My App')
  assert.equal(workspaceHomePath(map), '/s/ib-ws-org-acme/ib-ws-proj-proj1')
  assert.equal(modulePath(map, 'docs'), '/s/ib-ws-org-acme/ib-ws-proj-proj1/docs')
  assert.equal(modulePath(map, 'mail'), '/external/email')
})
