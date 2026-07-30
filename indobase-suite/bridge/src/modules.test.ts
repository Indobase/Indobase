import assert from 'node:assert/strict'
import test from 'node:test'

import { modulePath, isSuiteModuleId, listModulesForApi } from './modules.js'
import { buildWorkspaceMap } from './workspace-map.js'

test('modulePath builds deep links and mail external', () => {
  const map = buildWorkspaceMap({ orgSlug: 'acme', projectRef: 'proj1' })
  assert.equal(modulePath(map, 'docs'), '/s/ib-ws-org-acme/ib-ws-proj-proj1/docs')
  assert.equal(modulePath(map, 'mail'), '/external/email')
})

test('isSuiteModuleId rejects unknown', () => {
  assert.equal(isSuiteModuleId('docs'), true)
  assert.equal(isSuiteModuleId('drive'), false)
})

test('listModulesForApi marks meetings/calendar placeholders', () => {
  const mods = listModulesForApi()
  assert.equal(mods.find((m) => m.id === 'meetings')?.placeholder, true)
  assert.equal(mods.find((m) => m.id === 'calendar')?.placeholder, true)
  assert.equal(mods.find((m) => m.id === 'docs')?.placeholder, undefined)
})
