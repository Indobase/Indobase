import { describe, expect, it } from 'vitest'
import {
  applyProductPriceToInheritedVariants,
  catalogStatsFromProducts,
  checkoutAmountMinor,
  displayPriceMinorFromVariants,
  expandVariantMatrix,
  inventoryFromCatalogProducts,
  persistCatalogProjection,
  purchasableUnitPriceMinor,
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

  it('projected catalog products always have at least one variant; checkout uses variantId', () => {
    const projected = persistCatalogProjection([
      { id: 'p1', name: 'Ridge Pack Extra', priceMinor: 899900, stock: 4 },
    ])
    expect(projected[0]?.variants?.length).toBeGreaterThanOrEqual(1)
    const variantId = projected[0]!.variants![0]!.id
    expect(variantId).not.toBe('p1')
    expect(checkoutAmountMinor(projected[0]!, { variantId, quantity: 1 })).toBe(899900)
    expect(resolveProductVariant(projected[0]!, { variantId })?.id).toBe(variantId)
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

  it('product price mutation updates inheriting variants; checkout charges variant only', () => {
    const variants = ['7', '8', '9'].map((size, i) => ({
      id: `v${i}`,
      options: { Size: size },
      priceMinor: 1299900,
      stock: 4,
      default: i === 0,
    }))
    const product = {
      id: 'p1',
      name: 'Apex Runner',
      priceMinor: 1299900,
      stock: 12,
      variants: [...variants, { id: 'v-sale', options: { Size: '12' }, priceMinor: 999900, stock: 1 }],
    }
    const next = applyProductPriceToInheritedVariants(product, 1349900)
    expect(next.variants?.filter((v) => v.id !== 'v-sale').every((v) => v.priceMinor === 1349900)).toBe(true)
    expect(next.variants?.find((v) => v.id === 'v-sale')?.priceMinor).toBe(999900)
    expect(next.priceMinor).toBe(displayPriceMinorFromVariants(next.variants))
    expect(next.priceMinor).toBe(999900)
    const charged = checkoutAmountMinor(next, { variantId: 'v1', quantity: 1 })
    expect(charged).toBe(1349900)
    expect(purchasableUnitPriceMinor(next.variants?.find((v) => v.id === 'v1'))).toBe(1349900)
    expect(charged).not.toBe(1299900)
  })
})
