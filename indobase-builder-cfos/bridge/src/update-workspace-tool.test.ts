import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  UPDATE_WORKSPACE_TOOL,
  assertUpdateWorkspaceHasName,
  updateWorkspaceToolCatalog,
} from './update-workspace-tool.ts'

describe('updateWorkspace tool', () => {
  it('catalog points at same-origin tool wrapping Platform workspace/update', () => {
    const catalog = updateWorkspaceToolCatalog()
    assert.equal(catalog.name, 'updateWorkspace')
    assert.equal(catalog.path, '/api/os/tools/updateWorkspace')
    assert.equal(catalog.alias_path, '/api/os/tools/renameBusiness')
    assert.equal(catalog.wraps, '/api/os/v1/workspace/update')
    assert.ok(catalog.aliases.includes('renameBusiness'))
    assert.ok(catalog.aliases.includes('setBusinessName'))
    assert.equal(UPDATE_WORKSPACE_TOOL.method, 'POST')
    assert.match(catalog.rules, /updateWorkspace/)
  })

  it('requires name or brand', () => {
    assert.equal(assertUpdateWorkspaceHasName({}).ok, false)
    assert.equal(assertUpdateWorkspaceHasName({ name: 'Acme Shop' }).ok, true)
    assert.equal(assertUpdateWorkspaceHasName({ brand: 'Acme' }).ok, true)
  })
})
