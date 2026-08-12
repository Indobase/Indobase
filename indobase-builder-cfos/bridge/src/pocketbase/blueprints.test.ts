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
    assert.equal(isOpenWriteRule('true'), true)
    assert.equal(isOpenWriteRule('1 = 1'), true)
  })

  it('owner/org create rules avoid deprecated @request.data.* (PB rejects them)', () => {
    const owner = rulesForProfile('owner')
    const org = rulesForProfile('members_of_org')
    assert.doesNotMatch(owner.createRule || '', /@request\.data\./)
    assert.doesNotMatch(org.createRule || '', /@request\.data\./)
    assert.match(owner.createRule || '', /owner = @request\.auth\.id/)
    assert.match(org.createRule || '', /org_id != ""/)
  })

  it('public_read_auth_write keeps writes authenticated', () => {
    const rules = rulesForProfile('public_read_auth_write')
    assert.equal(rules.listRule, '')
    assert.match(rules.createRule || '', /@request\.auth\.id/)
    assert.equal(isSecureWriteRules(rules), true)
  })

  it('ecommerce locks transactional collections to admin-only (Commerce authority)', () => {
    const ecom = getBlueprint('ecommerce')
    const byName = Object.fromEntries(ecom.collections.map((c) => [c.name, c]))
    assert.equal(byName.products.rules, 'public_read_admin_write')
    assert.equal(byName.orders.rules, 'admin_only')
    assert.equal(byName.order_items.rules, 'admin_only')
    assert.equal(byName.inventory_reservations.rules, 'admin_only')

    const products = rulesForProfile('public_read_admin_write')
    assert.equal(products.listRule, '')
    assert.equal(products.createRule, null)
    assert.equal(products.updateRule, null)

    const orders = rulesForProfile('admin_only')
    assert.equal(orders.listRule, null)
    assert.equal(orders.createRule, null)
    assert.equal(isSecureWriteRules(orders), true)
    assert.equal(isOpenWriteRule(orders.createRule), false)
  })
})
