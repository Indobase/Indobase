import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { CFOS_SPA_SHELL_PREFIXES, isCfosSpaShellPath } from './cfos-spa-shell.ts'

describe('cfos spa shell paths', () => {
  it('matches plural shell routes and nested paths', () => {
    assert.equal(isCfosSpaShellPath('/workspaces'), true)
    assert.equal(isCfosSpaShellPath('/workspaces/abc'), true)
    assert.equal(isCfosSpaShellPath('/blueprints'), true)
    assert.equal(isCfosSpaShellPath('/explore?x=1'), true)
    assert.ok(CFOS_SPA_SHELL_PREFIXES.includes('/outputs'))
  })

  it('does not match APIs, assets, or singular workspace deep links', () => {
    assert.equal(isCfosSpaShellPath('/workspace'), false)
    assert.equal(isCfosSpaShellPath('/workspace/abc'), false)
    assert.equal(isCfosSpaShellPath('/api/session'), false)
    assert.equal(isCfosSpaShellPath('/assets/index.js'), false)
    assert.equal(isCfosSpaShellPath('/sso/health'), false)
  })
})
