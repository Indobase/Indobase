import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildCrmScopeMap,
  crmPipelineKeyForProjectRef,
  crmPipelinePath,
  crmTeamKeyForOrgSlug,
  crmWorkspaceOrigin,
  crmWorkspaceSubdomainForTeamKey,
  upstreamCrmPath,
} from './crm-map.js'

test('crmTeamKeyForOrgSlug is stable and sanitized', () => {
  assert.equal(crmTeamKeyForOrgSlug('Acme-Co'), 'ib-crm-org-acme-co')
  assert.equal(crmTeamKeyForOrgSlug(''), 'ib-crm-org-default')
})

test('crmPipelineKeyForProjectRef is stable and sanitized', () => {
  assert.equal(crmPipelineKeyForProjectRef('proj-ABC_123'), 'ib-crm-proj-projabc123')
  assert.equal(crmPipelineKeyForProjectRef(''), 'ib-crm-proj-default')
})

test('buildCrmScopeMap includes titles', () => {
  const map = buildCrmScopeMap({
    orgSlug: 'acme',
    projectRef: 'xyz123',
    projectName: 'My App',
    organizationName: 'Acme Inc',
  })
  assert.equal(map.teamTitle, 'Acme Inc')
  assert.equal(map.pipelineTitle, 'My App')
  assert.equal(map.teamKey, 'ib-crm-org-acme')
  assert.equal(map.pipelineKey, 'ib-crm-proj-xyz123')
})

test('crmPipelinePath lands on opportunities with scope query', () => {
  const map = buildCrmScopeMap({ orgSlug: 'acme', projectRef: 'xyz123' })
  assert.match(crmPipelinePath(map), /^\/objects\/opportunities\?/)
  assert.match(crmPipelinePath(map), /ib_team=ib-crm-org-acme/)
})

test('crmWorkspaceSubdomainForTeamKey is stable and short', () => {
  assert.equal(crmWorkspaceSubdomainForTeamKey('ib-crm-org-acme'), 'o-acme')
  assert.equal(crmWorkspaceSubdomainForTeamKey('ib-crm-org-default'), 'o-default')
  assert.ok(crmWorkspaceSubdomainForTeamKey(`ib-crm-org-${'x'.repeat(80)}`).length <= 30)
})

test('crmWorkspaceOrigin builds synthetic multi-workspace origin', () => {
  assert.equal(
    crmWorkspaceOrigin('https://crm.indobase.in', 'o-acme'),
    'https://o-acme.crm.indobase.in',
  )
})

test('upstreamCrmPath maps bridge routes to CRM SPA paths', () => {
  assert.equal(upstreamCrmPath('/c/ib-crm-org-acme/ib-crm-proj-xyz123'), '/objects/opportunities')
  assert.equal(upstreamCrmPath('/objects/opportunities'), '/objects/opportunities')
  assert.equal(upstreamCrmPath('/verify'), '/verify')
  assert.equal(upstreamCrmPath('/graphql'), '/graphql')
  assert.equal(
    upstreamCrmPath('/assets/index.js'),
    '/assets/index.js',
  )
})
