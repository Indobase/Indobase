/**
 * Parse Shopify-class catalog intent: one product with option variants, not N products.
 */

export type ProductOptionMap = Record<string, string[]>

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

function variantTitleFromOptions(options: Record<string, string>): string {
  return Object.values(options).filter(Boolean).join(' / ')
}

const COLOR_WORDS = [
  'black',
  'white',
  'red',
  'blue',
  'green',
  'navy',
  'grey',
  'gray',
  'brown',
  'pink',
  'gold',
  'silver',
  'beige',
  'cream',
  'orange',
  'yellow',
  'purple',
  'olive',
  'maroon',
]

export function parseSizeValues(text: string): string[] {
  const range = text.match(/\bsizes?\s+(\d+(?:\.\d+)?)\s*[–-]\s*(\d+(?:\.\d+)?)/i)
  if (range) {
    const start = Number(range[1])
    const end = Number(range[2])
    if (Number.isFinite(start) && Number.isFinite(end) && end >= start && end - start <= 20) {
      const out: string[] = []
      for (let n = start; n <= end; n += 1) out.push(String(n))
      return out
    }
  }
  const list = text.match(/\bsizes?\s+([\d.,\sando&]+)/i)
  if (list?.[1]) {
    const nums = list[1].match(/\d+(?:\.\d+)?/g) || []
    if (nums.length) return nums
  }
  const single = text.match(/\bsize\s+(\d+(?:\.\d+)?)\b/i)
  return single?.[1] ? [single[1]] : []
}

export function parseColorValues(text: string): string[] {
  const named = text.match(/\b(?:color|colour)\s+([A-Za-z][\w-]{1,24})/i)
  if (named?.[1]) return [capitalize(named[1])]
  const found = COLOR_WORDS.filter((c) => new RegExp(`\\b${c}\\b`, 'i').test(text))
  return [...new Set(found.map(capitalize))]
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase()
}

export function parseProductOptions(text: string): ProductOptionMap {
  const options: ProductOptionMap = {}
  const colors = parseColorValues(text)
  const sizes = parseSizeValues(text)
  if (colors.length) options.Color = colors
  if (sizes.length) options.Size = sizes
  return options
}

export function productNameFromCreateIntent(text: string): string {
  const stripped = text
    .replace(
      /^(?:please\s+)?(?:add|create)\s+(?:the\s+|a\s+|an\s+|new\s+)?(?:product(?:\s+called|\s+named)?\s+)?/i,
      '',
    )
    .trim()
  const cut = stripped
    .split(/\s+(?:at|for|priced|with sizes?|in sizes?|sizes?\b)/i)[0] || stripped
  return cut.replace(/[.?!]+$/, '').trim() || 'New product'
}

export function variantRowsFromOptions(
  slug: string,
  options: ProductOptionMap,
  priceMinor: number,
  stockEach: number,
): Array<{ sku: string; title: string; options: Record<string, string>; priceMinor: number; stock: number }> {
  const matrix = expandVariantMatrix(options)
  if (matrix.length === 1 && Object.keys(matrix[0] || {}).length === 0) return []
  return matrix.map((opts) => {
    const title = variantTitleFromOptions(opts)
    const sku = [slug, ...Object.values(opts).map((v) => v.toLowerCase().replace(/[^a-z0-9]+/g, ''))]
      .filter(Boolean)
      .join('-')
      .slice(0, 48)
    return { sku, title, options: opts, priceMinor, stock: stockEach }
  })
}

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

export function variantIdsInheritingProductPrice(product: {
  priceMinor?: number
  variants?: Array<{ id: string; priceMinor?: number; default?: boolean }>
}): string[] {
  const variants = product.variants?.length ? product.variants : []
  if (!variants.length) return []
  const previous = product.priceMinor
  const matching =
    typeof previous === 'number' ? variants.filter((v) => v.priceMinor === previous) : []
  if (matching.length) return matching.map((v) => v.id)
  const def = variants.find((v) => v.default) || variants[0]
  return def ? [def.id] : []
}

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
  product: { id: string; name?: string; priceMinor?: number; variants?: Array<{ id?: string; priceMinor?: number; default?: boolean }> },
  input: { variantId?: string; quantity: number },
): number | null {
  const variants = product.variants?.length ? product.variants : []
  const variant =
    (input.variantId && variants.find((v) => v.id === input.variantId)) ||
    variants.find((v) => v.default) ||
    variants[0]
  const unit = purchasableUnitPriceMinor(variant)
  if (unit == null) return null
  const qty = Math.floor(Number(input.quantity || 0))
  if (qty < 1) return null
  return unit * qty
}

export function defaultVariantForProduct(product: {
  id: string
  sku?: string
  priceMinor?: number
  stock?: number
  variants?: Array<{ id: string; priceMinor?: number; default?: boolean; sku?: string; title?: string; options?: Record<string, string>; stock?: number }>
}): NonNullable<(typeof product)['variants']>[number] {
  const existing = product.variants?.find((v) => v.default) || product.variants?.[0]
  if (existing) return existing
  return {
    id: `${product.id}__default`,
    sku: product.sku || product.id,
    title: 'Default',
    options: {},
    priceMinor: product.priceMinor,
    stock: product.stock,
    default: true,
  }
}

export function persistCatalogProjection<
  T extends {
    id: string
    name?: string
    priceMinor?: number
    stock?: number
    sku?: string
    variants?: Array<{
      id: string
      sku?: string
      title?: string
      options?: Record<string, string>
      priceMinor?: number
      stock?: number
      default?: boolean
    }>
  },
>(products: T[]): T[] {
  return products.map((product) => {
    const variants = product.variants?.length ? product.variants : [defaultVariantForProduct(product)]
    return {
      ...product,
      variants,
      priceMinor: displayPriceMinorFromVariants(variants, product.priceMinor) ?? product.priceMinor,
    }
  })
}

export function parseCollectionName(text: string): string | undefined {
  const named = text.match(
    /\b(?:collection|category)\s+(?:called|named)\s+["']?([A-Za-z][\w\s-]{1,48})["']?/i,
  )
  if (named?.[1]) return named[1].replace(/[.?!]+$/, '').trim()
  const create = text.match(
    /\b(?:create|add)\s+(?:a\s+|an\s+|new\s+)?collection\s+(?:called\s+|named\s+)?["']?([A-Za-z][\w\s-]{1,48})["']?/i,
  )
  return create?.[1]?.replace(/[.?!]+$/, '').trim()
}
