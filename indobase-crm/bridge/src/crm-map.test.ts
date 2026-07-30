import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildCrmScopeMap,
  crmPipelineKeyForProjectRef,
  crmTeamKeyForOrgSlug,
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

test('upstreamCrmPath maps bridge routes to Frappe CRM SPA entry', () => {
  assert.equal(upstreamCrmPath('/c/ib-crm-org-acme/ib-crm-proj-xyz123'), '/app/crm')
  assert.equal(upstreamCrmPath('/crm/leads'), '/app/crm/leads')
  assert.equal(upstreamCrmPath('/app/crm'), '/app/crm')
  assert.equal(upstreamCrmPath('/'), '/app/crm')
  assert.equal(
    upstreamCrmPath('/assets/frappe/dist/js/libs.bundle.js'),
    '/assets/frappe/dist/js/libs.bundle.js'
  )
})
