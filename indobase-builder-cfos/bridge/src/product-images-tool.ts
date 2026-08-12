/**
 * resolveProductImages — Openverse commercial stock URLs for catalogs / heroes.
 */

import { platformResolveProductImages } from './platform-api-client.js'

export const RESOLVE_PRODUCT_IMAGES_TOOL = {
  name: 'resolveProductImages',
  aliases: ['findProductImages', 'resolve_product_images'] as const,
  description:
    'Resolve commercial-friendly HTTPS image URLs (Openverse) for product names or search queries. ' +
    'Pass results as image_url into setupShopCatalog. Never invent Unsplash/Pexels URLs. Do not use webFetch.',
  method: 'POST' as const,
  path: '/api/os/tools/resolveProductImages',
  wraps: '/api/os/media/product-images',
  parameters: {
    type: 'object',
    required: ['queries'],
    properties: {
      queries: {
        type: 'array',
        items: { type: 'string' },
        description: 'Product names or search phrases',
      },
      page_size: { type: 'number', description: 'Results per query (default 3)' },
    },
  },
} as const

export const PRODUCT_IMAGES_AGENT_HARD_RULES = `
## Product / catalog imagery (HARD PATH)

1. Call **resolveProductImages** with product name queries before seeding a catalog (or rely on guidedBackend which runs it on the critical path with timeout + placeholders).
2. Set each product \`image_url\` from the returned HTTPS urls (Openverse / CC commercial).
3. For logos/brand graphics use Design format (\`format.design\`) — not this tool.
4. Never invent Unsplash/Pexels/stock IDs. Never claim native AI product photography unless you actually generated assets.
5. If resolve times out, placeholders are OK for first seed — do not block catalog/Go Live on imagery alone.
`.trim()

export function resolveProductImagesToolCatalog() {
  return {
    name: RESOLVE_PRODUCT_IMAGES_TOOL.name,
    aliases: [...RESOLVE_PRODUCT_IMAGES_TOOL.aliases],
    description: RESOLVE_PRODUCT_IMAGES_TOOL.description,
    method: RESOLVE_PRODUCT_IMAGES_TOOL.method,
    path: RESOLVE_PRODUCT_IMAGES_TOOL.path,
    wraps: RESOLVE_PRODUCT_IMAGES_TOOL.wraps,
    parameters: RESOLVE_PRODUCT_IMAGES_TOOL.parameters,
    rules: PRODUCT_IMAGES_AGENT_HARD_RULES,
  }
}

export async function executeResolveProductImages(
  session: { gotrueId: string; email: string; projectRef: string },
  input: { queries?: string[] | null; page_size?: number | null },
) {
  const result = await platformResolveProductImages({
    gotrueId: session.gotrueId,
    email: session.email,
    workspaceRef: session.projectRef,
    queries: input.queries,
    pageSize: input.page_size,
  })
  return {
    ...result,
    tool: 'resolveProductImages' as const,
  }
}
