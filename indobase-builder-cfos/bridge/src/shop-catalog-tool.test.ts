import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  SHOP_CATALOG_AGENT_HARD_RULES,
  listShopOrdersToolCatalog,
  placeTestShopOrderToolCatalog,
  setupShopCatalogToolCatalog,
} from './shop-catalog-tool.ts'

describe('shop catalog tools', () => {
  it('setupShopCatalog catalog points at OS tool path', () => {
    const catalog = setupShopCatalogToolCatalog()
    assert.equal(catalog.name, 'setupShopCatalog')
    assert.equal(catalog.path, '/api/os/tools/setupShopCatalog')
    assert.equal(catalog.wraps, '/api/os/shop/catalog')
    assert.ok(catalog.aliases.includes('seedShopCatalog'))
  })

  it('list + place-test catalogs are discoverable', () => {
    assert.equal(listShopOrdersToolCatalog().path, '/api/os/tools/listShopOrders')
    assert.equal(placeTestShopOrderToolCatalog().path, '/api/os/tools/placeTestShopOrder')
  })

  it('hard rules require setupShopCatalog, imagery, and live admin (no republish)', () => {
    assert.match(SHOP_CATALOG_AGENT_HARD_RULES, /setupShopCatalog|guidedBackend/)
    assert.match(SHOP_CATALOG_AGENT_HARD_RULES, /placeTestShopOrder/)
    assert.match(SHOP_CATALOG_AGENT_HARD_RULES, /admin_html/)
    assert.match(SHOP_CATALOG_AGENT_HARD_RULES, /wireCheckout/)
    assert.match(SHOP_CATALOG_AGENT_HARD_RULES, /Wire storefront|store ladder|Payments last/i)
    assert.match(SHOP_CATALOG_AGENT_HARD_RULES, /do NOT republish/i)
  })
})
