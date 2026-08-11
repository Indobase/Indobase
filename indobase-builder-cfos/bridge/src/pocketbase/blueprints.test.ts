import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  getBlueprint,
  isOpenWriteRule,
  isSecureWriteRules,
  resolveBlueprintId,
  rulesForProfile,
} from './blueprints.ts'

describe('backend blueprints', () => {
  it('resolves vertical aliases', () => {
    assert.equal(resolveBlueprintId('shop'), 'ecommerce')
    assert.equal(resolveBlueprintId('b2b'), 'saas')
    assert.equal(resolveBlueprintId('appointments'), 'booking')
  })

  it('saas blueprint includes ownership fields', () => {
    const saas = getBlueprint('saas')
    assert.ok(saas.collections.some((c) => c.name === 'organizations'))
    assert.ok(saas.collections.every((c) => c.fields.some((f) => f.name === 'owner')))
  })

  it('owner write rules are not world-open', () => {
    const rules = rulesForProfile('owner')
    assert.equal(isSecureWriteRules(rules), true)
    assert.equal(isOpenWriteRule(rules.createRule), false)
    assert.equal(isOpenWriteRule(''), true)
    assert.equal(isOpenWriteRule(null), false)
  })

  it('public_read_auth_write keeps writes authenticated', () => {
    const rules = rulesForProfile('public_read_auth_write')
    assert.equal(rules.listRule, '')
    assert.match(rules.createRule || '', /@request\.auth\.id/)
    assert.equal(isSecureWriteRules(rules), true)
  })
})
