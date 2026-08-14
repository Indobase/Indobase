/**
 * Catalog domain — Product → Variant, Collection.
 * Discounts, refunds, and SEO are out of scope.
 */

import type { BusinessInventoryItem, BusinessProduct } from './data'

/** Products at or below this on-hand count are “low stock”. Not a forecast. */
export const LOW_STOCK_THRESHOLD = 5

export type ProductOptionMap = Record<string, string[]>

export type CatalogVariantSpec = {
  sku?: string
  title?: string
  options: Record<string, string>
  /** Purchasable unit price. Product-level price is display-only. */
  priceMinor?: number
  stock?: number
}

export type BusinessCatalogCollection = {
  id: string
  name: string
  slug?: string
  productIds: string[]
  rule?: { category?: string; tag?: string } | null
}

export function expandVariantMatrix(options: ProductOptionMap): Array<Record<string, string>> {
  const keys = Object.keys(options).filter((k) => (options[k] || []).length > 0)
  if (!keys.length) return [{}]
  return keys.reduce<Array<Record<string, string>>>((acc, key) => {
    const values = options[key] || []
    const next: Array<Record<string, string>> = []
    for (const row of acc.length ? acc : [{}]) {
      for (const value of values) {
        next.push({ ...row, [key]: value })
      }
    }
    return next
  }, [])
}

export function variantTitleFromOptions(options: Record<string, string>): string {
  return Object.values(options).filter(Boolean).join(' / ')
}

/** Distinct from product.id — product is not purchasable. */
export function defaultVariantIdForProduct(productId: string): string {
  return `${productId}__default`
}

export function defaultVariantForProduct(product: BusinessProduct): NonNullable<BusinessProduct['variants']>[number] {
  const existing = product.variants?.find((v) => v.default) || product.variants?.[0]
  if (existing) return existing
  return {
    id: defaultVariantIdForProduct(product.id),
    sku: product.sku || product.id,
    title: 'Default',
    options: {},
    priceMinor: product.priceMinor,
    stock: product.stock,
    default: true,
  }
}

/**
 * Purchasable price is Variant.price only.
 * Product.priceMinor is derived display metadata (min variant price).
 */
export function purchasableUnitPriceMinor(variant: { priceMinor?: number } | null | undefined): number | null {
  if (!variant || typeof variant.priceMinor !== 'number' || !Number.isFinite(variant.priceMinor)) return null
  return variant.priceMinor
}

export function displayPriceMinorFromVariants(
  variants: Array<{ priceMinor?: number }> | undefined,
  fallback?: number,
): number | undefined {
  const prices = (variants || [])
    .map((v) => v.priceMinor)
    .filter((n): n is number => typeof n === 'number' && Number.isFinite(n))
  if (!prices.length) return fallback
  return Math.min(...prices)
}

export function withDerivedProductDisplayPrice<T extends { priceMinor?: number; variants?: Array<{ priceMinor?: number }> }>(
  product: T,
): T {
  const derived = displayPriceMinorFromVariants(product.variants, product.priceMinor)
  return derived === product.priceMinor ? product : { ...product, priceMinor: derived }
}

/** Variants that still share Product.price (inherit) — plus default if none match. */
export function variantIdsInheritingProductPrice(product: {
  priceMinor?: number
  variants?: Array<{ id: string; priceMinor?: number; default?: boolean }>
}): string[] {
  const variants = product.variants?.length ? product.variants : []
  if (!variants.length) return []
  const previous = product.priceMinor
  const matching =
    typeof previous === 'number'
      ? variants.filter((v) => v.priceMinor === previous)
      : []
  if (matching.length) return matching.map((v) => v.id)
  const def = variants.find((v) => v.default) || variants[0]
  return def ? [def.id] : []
}

/** Product-level price mutation updates inheriting variants, then re-derives display price. */
export function applyProductPriceToInheritedVariants<
  T extends { priceMinor?: number; variants?: Array<{ id: string; priceMinor?: number; default?: boolean }> },
>(product: T, nextPriceMinor: number): T {
  const ids = new Set(variantIdsInheritingProductPrice(product))
  const variants = (product.variants || []).map((v) =>
    ids.has(v.id) ? { ...v, priceMinor: nextPriceMinor } : v,
  )
  return {
    ...product,
    variants,
    priceMinor: displayPriceMinorFromVariants(variants, nextPriceMinor),
  }
}

export function checkoutAmountMinor(
  product: BusinessProduct,
  input: { variantId?: string; productId?: string; quantity: number },
): number | null {
  const variant = resolveProductVariant(product, input)
  const unit = purchasableUnitPriceMinor(variant)
  if (unit == null) return null
  const qty = Math.floor(Number(input.quantity || 0))
  if (qty < 1) return null
  return unit * qty
}

export function resolveProductVariant(
  product: BusinessProduct,
  input: { variantId?: string; productId?: string },
): NonNullable<BusinessProduct['variants']>[number] | null {
  const variants = product.variants?.length ? product.variants : [defaultVariantForProduct(product)]
  if (input.variantId) {
    return variants.find((v) => v.id === input.variantId) || null
  }
  return variants.find((v) => v.default) || variants[0] || null
}

export function inventoryFromCatalogProducts(products: BusinessProduct[]): BusinessInventoryItem[] {
  const rows: BusinessInventoryItem[] = []
  for (const product of products) {
    const variants = product.variants?.length ? product.variants : [defaultVariantForProduct(product)]
    for (const variant of variants) {
      if (typeof variant.stock !== 'number' && typeof product.stock !== 'number') continue
      rows.push({
        id: variant.id,
        productId: product.id,
        variantId: variant.id,
        sku: variant.sku || product.sku,
        quantity: typeof variant.stock === 'number' ? variant.stock : product.stock,
      })
    }
  }
  return rows
}

export function catalogStatsFromProducts(products: BusinessProduct[]): {
  productCount: number
  inStockCount: number
  lowStockCount: number
  variantCount: number
} {
  let inStockCount = 0
  let lowStockCount = 0
  let variantCount = 0
  for (const product of products) {
    const variants = product.variants?.length ? product.variants : [defaultVariantForProduct(product)]
    variantCount += variants.length
    const stock = variants.reduce((sum, v) => sum + (typeof v.stock === 'number' ? v.stock : 0), 0)
    const effective = typeof product.stock === 'number' ? product.stock : stock
    if (effective > 0) inStockCount += 1
    if (effective > 0 && effective <= LOW_STOCK_THRESHOLD) lowStockCount += 1
  }
  return {
    productCount: products.length,
    inStockCount,
    lowStockCount,
    variantCount,
  }
}
