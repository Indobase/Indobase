import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { injectStorefrontProductSnapshot } from '../ux/preview-artifact.ts'
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
    assert.match(html, /id="collectionFilters"/)
    assert.match(html, /id="pdpDlg"/)
    assert.match(html, /id="confirmDlg"/)
    assert.match(html, /qty-btn/)
    assert.match(html, /data-act="rm"/)
    assert.match(html, /id="openOrders"/)
    assert.match(html, /id="openAccount"/)
    assert.match(html, /data-ib-section="hero"/)
    assert.match(html, /data-ib-section="products"/)
    assert.match(html, /customer\.startOtp/)
    assert.match(html, /customer\.verifyOtp/)
    assert.match(html, /customer\.orders\.list/)
    assert.match(html, /commerce\.orders\.get/)
    assert.match(html, /Create an account to track your orders/)
    assert.doesNotMatch(html, /__INDOBASE_COLLECTION__\('orders'\)/)
    assert.doesNotMatch(html, /\/api\/collections\/.+\/orders/)
    assert.match(html, /I couldn't complete the order yet/)
    assert.doesNotMatch(html, /e&&e\.message\?e\.message/)
    assert.doesNotMatch(html, /Showing snapshot/)
    assert.match(html, /data-ib-safe="1"/)
    assert.doesNotMatch(html, /verified\.order\.paymentStatus|paymentStatus\|\|/)
    assert.match(html, /function defaultVariant/)
    assert.match(html, /data-variant/)
  })

  it('catalog projection patches the baked products snapshot', () => {
    const html = buildManagedShopStorefrontHtml({
      brand: 'NorthPeak',
      appId: 'np01',
      publicUrl: 'https://backend.indobase.in',
      products: [{ id: 'seed', name: 'Apex Runner', price: 12999, stock: 8 }],
    })
    const next = injectStorefrontProductSnapshot(html, [
      { id: 'seed', name: 'Apex Runner', priceMinor: 1299900, stock: 8 },
      { id: 'extra', name: 'Apex Runner Extra', priceMinor: 1299900, stock: 10 },
    ])
    assert.match(next, /Apex Runner Extra/)
    assert.match(next, /1299900/)
    assert.match(next, /commerce\.products\.list/)
    assert.match(next, /__default/)
    const baked = JSON.parse((next.match(/let products=(\[[\s\S]*?\]);/) || [])[1] || '[]') as Array<{
      variants?: unknown[]
    }>
    assert.ok(baked.every((p) => Array.isArray(p.variants) && p.variants.length >= 1))
  })
})
