import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  CONNECT_GATEWAY_TOOL,
  assertConnectGatewayHasKeys,
  connectGatewayToolCatalog,
} from './connect-gateway-tool.ts'

describe('connectGateway tool', () => {
  it('catalog points at same-origin tool wrapping payments connect-gateway', () => {
    const catalog = connectGatewayToolCatalog()
    assert.equal(catalog.name, 'connectGateway')
    assert.equal(catalog.path, '/api/os/tools/connectGateway')
    assert.equal(catalog.alias_path, '/api/os/tools/connectPaymentGateway')
    assert.equal(catalog.wraps, '/api/os/payments/connect-gateway')
    assert.ok(catalog.aliases.includes('connectPaymentGateway'))
    assert.equal(CONNECT_GATEWAY_TOOL.method, 'POST')
  })

  it('requires settlement_market and rail-specific keys', () => {
    assert.equal(assertConnectGatewayHasKeys({}).ok, false)
    assert.equal(
      assertConnectGatewayHasKeys({
        settlement_market: 'india',
        key_id: 'rzp_test_x',
      }).ok,
      false
    )
    assert.equal(
      assertConnectGatewayHasKeys({
        settlement_market: 'india',
        key_id: 'rzp_test_x',
        key_secret: 'secretsecretsecret',
      }).ok,
      true
    )
    assert.equal(
      assertConnectGatewayHasKeys({
        settlement_market: 'international',
        secret_key: 'sk_test_x',
      }).ok,
      false
    )
    assert.equal(
      assertConnectGatewayHasKeys({
        settlement_market: 'stripe',
        secret_key: 'sk_test_x',
        publishable_key: 'pk_test_x',
      }).ok,
      true
    )
  })
})
