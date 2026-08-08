import { describe, expect, it } from 'vitest'

import { __shopCatalogTest } from './shop-catalog'

const { priceToCents, slugify, buildShopAdminHtml, DDL_STATEMENTS } = __shopCatalogTest

describe('shop-catalog helpers', () => {
  it('converts major units to cents', () => {
    expect(priceToCents('480')).toBe(48000)
    expect(priceToCents('19.99')).toBe(1999)
    expect(priceToCents('-1')).toBeNull()
    expect(priceToCents('abc')).toBeNull()
  })

  it('slugifies product names', () => {
    expect(slugify('Wool Coat')).toBe('wool-coat')
    expect(slugify('  Organic Cotton Tee!! ')).toBe('organic-cotton-tee')
  })

  it('includes atomic place_order DDL', () => {
    expect(DDL_STATEMENTS.some((s) => s.includes('shop_place_order'))).toBe(true)
    expect(DDL_STATEMENTS.some((s) => s.includes('shop_products'))).toBe(true)
  })

  it('builds admin html with inventory and orders', () => {
    const html = buildShopAdminHtml({
      brand: 'MERIDIAN',
      products: [
        {
          id: '1',
          slug: 'wool-coat',
          name: 'Wool Coat',
          description: null,
          price_cents: 48000,
          currency: 'USD',
          stock: 24,
          image_url: null,
          active: true,
        },
      ],
      orders: [
        {
          id: 'o1',
          order_number: 'ORD-TEST',
          email: 'buyer@example.com',
          status: 'confirmed',
          subtotal_cents: 48000,
          shipping_cents: 0,
          total_cents: 48000,
          currency: 'USD',
          created_at: '2026-08-09',
        },
      ],
    })
    expect(html).toContain('MERIDIAN — Admin')
    expect(html).toContain('wool-coat')
    expect(html).toContain('ORD-TEST')
    expect(html).toContain('Snapshot fallback')
  })

  it('builds live-refresh admin when REST bindings are present', () => {
    const html = buildShopAdminHtml({
      brand: 'MERIDIAN',
      products: [],
      orders: [],
      restUrl: 'https://proj.indobase.in/rest/v1',
      anonKey: 'anon-test-key',
    })
    expect(html).toContain('Live data from your Indobase project REST API')
    expect(html).toContain('shop_products')
    expect(html).toContain('shop_orders')
    expect(html).toContain('setInterval(refresh, 5000)')
    expect(html).toContain('anon-test-key')
    expect(DDL_STATEMENTS.some((s) => s.includes('grant select on public.shop_orders to anon'))).toBe(
      true
    )
  })
})
