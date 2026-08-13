import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { buildManagedShopStorefrontHtml } from './shop-storefront-html.ts'

describe('buildManagedShopStorefrontHtml', () => {
  it('binds to indobase.commerce runtime — not PocketBase orders create', () => {
    const html = buildManagedShopStorefrontHtml({
      brand: 'By Samosa Shop',
      appId: 'rosamasa01',
      publicUrl: 'https://backend.indobase.in',
      commerceBaseUrl: 'https://builder.indobase.in',
      products: [{ id: 'p1', slug: 'samosa-plate', name: 'Samosa Plate', price: 99, stock: 40 }],
    })
    assert.match(html, /By Samosa Shop/)
    assert.match(html, /window\.indobase\.commerce/)
    assert.match(html, /commerce\.products\.list/)
    assert.match(html, /commerce\.checkout\.create/)
    assert.match(html, /INDOBASE_COMMERCE_URL/)
    assert.match(html, /id="search"/)
    assert.match(html, /id="pdpDlg"/)
    assert.match(html, /id="confirmDlg"/)
    assert.match(html, /qty-btn/)
    assert.match(html, /data-act="rm"/)
    assert.doesNotMatch(html, /__INDOBASE_COLLECTION__\('orders'\)/)
    assert.doesNotMatch(html, /\/api\/collections\/.+\/orders/)
  })
})
