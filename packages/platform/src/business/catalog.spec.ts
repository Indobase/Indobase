import { describe, expect, it } from 'vitest'
import {
  catalogStatsFromProducts,
  expandVariantMatrix,
  inventoryFromCatalogProducts,
  resolveProductVariant,
} from './catalog'
import { catalogFromProducts, emptyBusinessRuntimeState } from './runtime-state'

describe('catalog domain', () => {
  it('expands size options into variants, not products', () => {
    const matrix = expandVariantMatrix({ Color: ['Black'], Size: ['7', '8', '9', '10', '11'] })
    expect(matrix).toHaveLength(5)
    expect(matrix.map((row) => row.Size)).toEqual(['7', '8', '9', '10', '11'])
  })

  it('counts one product with five variants in runtime catalog', () => {
    const variants = ['7', '8', '9', '10', '11'].map((size, i) => ({
      id: `v${i}`,
      sku: `apex-black-${size}`,
      options: { Color: 'Black', Size: size },
      priceMinor: 1299900,
      stock: 10,
      default: i === 0,
    }))
    const products = [
      {
        id: 'p1',
        name: 'Apex Runner',
        priceMinor: 1299900,
        stock: 50,
        variants,
      },
    ]
    const stats = catalogStatsFromProducts(products)
    expect(stats.productCount).toBe(1)
    expect(stats.variantCount).toBe(5)
    const catalog = catalogFromProducts(products)
    expect(catalog.productCount).toBe(1)
    expect(catalog.variantCount).toBe(5)
    const inventory = inventoryFromCatalogProducts(products)
    expect(inventory).toHaveLength(5)
    expect(inventory[0]?.variantId).toBe('v0')
    const state = emptyBusinessRuntimeState({
      products,
      catalog: { ...catalog, collections: [{ id: 'c1', name: 'Running', productIds: ['p1'] }] },
    })
    expect(state.catalog.collections?.[0]?.name).toBe('Running')
    expect(resolveProductVariant(products[0], { productId: 'p1' })?.id).toBe('v0')
    expect(resolveProductVariant(products[0], { variantId: 'v3' })?.options?.Size).toBe('10')
  })

  it('gives optionless products a default variant whose id is not the product id', () => {
    const product = { id: 'p1', name: 'Plain Tee', priceMinor: 199900, stock: 12 }
    const variant = resolveProductVariant(product, { productId: 'p1' })
    expect(variant?.id).toBeTruthy()
    expect(variant?.id).not.toBe(product.id)
    expect(variant?.default).toBe(true)
    const inventory = inventoryFromCatalogProducts([product])
    expect(inventory).toHaveLength(1)
    expect(inventory[0]?.variantId).toBe(variant?.id)
    expect(inventory[0]?.variantId).not.toBe(product.id)
  })
})
