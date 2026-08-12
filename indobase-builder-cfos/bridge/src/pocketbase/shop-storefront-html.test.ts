import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { buildManagedShopStorefrontHtml } from './shop-storefront-html.ts'

describe('buildManagedShopStorefrontHtml', () => {
  it('wires live products + order POST to records API', () => {
    const html = buildManagedShopStorefrontHtml({
      brand: 'By Samosa Shop',
      appId: 'rosamasa01',
      publicUrl: 'https://backend.indobase.in',
      products: [{ slug: 'samosa-plate', name: 'Samosa Plate', price: 99, stock: 40 }],
    })
    assert.match(html, /By Samosa Shop/)
    assert.match(html, /Samosa Plate/)
    assert.match(html, /INDOBASE_COLLECTION_PREFIX/)
    assert.match(html, /__INDOBASE_COLLECTION__\('products'\)/)
    assert.match(html, /__INDOBASE_COLLECTION__\('orders'\)/)
    assert.match(html, /fetch\(API\+'\/'\+col\+'\/records/)
    assert.match(html, /method:'POST'/)
    assert.match(html, /email/)
    assert.doesNotMatch(html, /localStorage/)
    assert.doesNotMatch(html, /shop_products/)
  })
})
