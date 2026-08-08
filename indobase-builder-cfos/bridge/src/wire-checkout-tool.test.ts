import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  WIRE_CHECKOUT_AGENT_HARD_RULES,
  WIRE_CHECKOUT_TOOL,
  wireCheckoutToolCatalog,
} from './wire-checkout-tool.ts'

describe('wireCheckout tool', () => {
  it('catalog points at same-origin tool wrapping payments wire-checkout', () => {
    const catalog = wireCheckoutToolCatalog()
    assert.equal(catalog.name, 'wireCheckout')
    assert.equal(catalog.path, '/api/os/tools/wireCheckout')
    assert.equal(catalog.alias_path, '/api/os/tools/wirePricing')
    assert.equal(catalog.wraps, '/api/os/payments/wire-checkout')
    assert.ok(catalog.aliases.includes('wirePricing'))
    assert.equal(WIRE_CHECKOUT_TOOL.method, 'POST')
  })

  it('hard rules require wireCheckout and forbid invented URLs', () => {
    assert.match(WIRE_CHECKOUT_AGENT_HARD_RULES, /wireCheckout/)
    assert.match(WIRE_CHECKOUT_AGENT_HARD_RULES, /checkout_url/)
    assert.match(WIRE_CHECKOUT_AGENT_HARD_RULES, /Do NOT invent/)
    assert.match(WIRE_CHECKOUT_AGENT_HARD_RULES, /gateway_not_ready/)
  })
})
