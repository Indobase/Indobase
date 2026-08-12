import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { buildManagedShopAdminHtml } from './shop-admin-html.ts'

describe('buildManagedShopAdminHtml', () => {
  it('uses PocketBase collection prefix helper and items parser', () => {
    const html = buildManagedShopAdminHtml({
      brand: 'Threadline',
      appId: 'roshb77a4744fa',
      publicUrl: 'https://backend.indobase.in',
      products: [{ slug: 'essential-tee', name: 'Essential Tee', price: 799, stock: 20 }],
      orders: [],
    })
    assert.match(html, /Threadline/)
    assert.match(html, /INDOBASE_COLLECTION_PREFIX/)
    assert.match(html, /__INDOBASE_COLLECTION__\('products'\)/)
    assert.match(html, /__INDOBASE_COLLECTION__\('orders'\)/)
    assert.match(html, /function pbItems/)
    assert.match(html, /Essential Tee/)
    assert.doesNotMatch(html, /shop_products/)
  })
})
