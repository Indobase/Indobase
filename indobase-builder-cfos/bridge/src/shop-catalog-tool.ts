/**
 * Agent-facing shop catalog tools — tenant DB products + inventory + admin HTML.
 * Closes Naïve-parity “real backend” gap (not Payments billing catalog).
 */

import { platformShopCatalog, platformShopOrders } from './platform-api-client.js'

export const SETUP_SHOP_CATALOG_TOOL = {
  name: 'setupShopCatalog',
  aliases: ['seedShopCatalog', 'addShopProducts', 'setup_shop_catalog'] as const,
  description:
    'Ensure customer database shop tables, upsert products with stock/prices/image_url, ' +
    'and return catalog_json + admin_html. Call after Enable database. ' +
    'For product photos: set image_url (Design export, Openverse, or HTTPS image). Do not use webFetch.',
  method: 'POST' as const,
  path: '/api/os/tools/setupShopCatalog',
  wraps: '/api/os/shop/catalog',
  parameters: {
    type: 'object',
    properties: {
      brand: { type: 'string', description: 'Brand name for admin_html title' },
      products: {
        type: 'array',
        description: 'Products to upsert (slug, name, price, stock, image_url, currency)',
        items: {
          type: 'object',
          properties: {
            slug: { type: 'string' },
            name: { type: 'string' },
            description: { type: 'string' },
            price: { type: 'string' },
            currency: { type: 'string' },
            stock: { type: 'number' },
            image_url: { type: 'string' },
            active: { type: 'boolean' },
          },
        },
      },
    },
  },
} as const

export const LIST_SHOP_ORDERS_TOOL = {
  name: 'listShopOrders',
  aliases: ['listShopCatalog', 'shopAdmin', 'list_shop_orders'] as const,
  description:
    'List shop products + recent orders and return admin_html snapshot. ' +
    'Publish admin_html via launchBusiness as admin.html. Do not use webFetch.',
  method: 'POST' as const,
  path: '/api/os/tools/listShopOrders',
  wraps: '/api/os/shop/orders',
  parameters: {
    type: 'object',
    properties: {
      brand: { type: 'string' },
    },
  },
} as const

export const PLACE_TEST_SHOP_ORDER_TOOL = {
  name: 'placeTestShopOrder',
  aliases: ['testShopCheckout', 'place_test_shop_order'] as const,
  description:
    'Place an atomic test order (validates stock, decrements inventory, writes order + line items). ' +
    'Pass cleanup:true (default) to restore stock after proof. Do not use webFetch.',
  method: 'POST' as const,
  path: '/api/os/tools/placeTestShopOrder',
  wraps: '/api/os/shop/orders',
  parameters: {
    type: 'object',
    required: ['order_email', 'items'],
    properties: {
      order_email: { type: 'string' },
      items: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            product_id: { type: 'string' },
            slug: { type: 'string' },
            quantity: { type: 'number' },
          },
        },
      },
      cleanup: { type: 'boolean', description: 'Restore stock and delete test order (default true)' },
      brand: { type: 'string' },
    },
  },
} as const

export const SHOP_CATALOG_AGENT_HARD_RULES = `
## Shop catalog / inventory (HARD PATH — ecommerce backend)

When the operator wants a real product backend (not just a static storefront) — typically after **Add a real backend**:

1. Prefer **guidedBackend** mode=ecommerce (or: ensureDatabase → resolveProductImages → setupShopCatalog).
2. Prove inventory: **placeTestShopOrder** with cleanup:true (default) — quote order_number + stock proof.
3. Emit FOLLOWUPS: Wire storefront → Go Live → Publish admin (≤4). Do **not** jump to wireCheckout yet.
4. **Wire storefront** to catalog_json / session.backend records API (\`INDOBASE_COLLECTION_PREFIX\` + \`/api/collections/{physical}/records\`). Buy CTA may stay placeholder until payments.
5. **Go Live** with launchBusiness (real html/files) — quote exact url.
6. Publish **admin_html** once as \`admin.html\` when asked — live REST refresh; do NOT republish just to refresh orders.
7. **Payments last** (when asked): India vs International → ensure → KYC → **connectGateway** → **wireCheckout** mode one_time (prefer INR for India) → patch Buy CTA. Never invent checkout URLs.
8. Never invent Unsplash/Pexels URLs. Claim “real backend” only after setupShopCatalog/guidedBackend ok + (optional) placeTestShopOrder ok.
`.trim()

export function setupShopCatalogToolCatalog() {
  return {
    name: SETUP_SHOP_CATALOG_TOOL.name,
    aliases: [...SETUP_SHOP_CATALOG_TOOL.aliases],
    description: SETUP_SHOP_CATALOG_TOOL.description,
    method: SETUP_SHOP_CATALOG_TOOL.method,
    path: SETUP_SHOP_CATALOG_TOOL.path,
    wraps: SETUP_SHOP_CATALOG_TOOL.wraps,
    parameters: SETUP_SHOP_CATALOG_TOOL.parameters,
    rules: SHOP_CATALOG_AGENT_HARD_RULES,
  }
}

export function listShopOrdersToolCatalog() {
  return {
    name: LIST_SHOP_ORDERS_TOOL.name,
    aliases: [...LIST_SHOP_ORDERS_TOOL.aliases],
    description: LIST_SHOP_ORDERS_TOOL.description,
    method: LIST_SHOP_ORDERS_TOOL.method,
    path: LIST_SHOP_ORDERS_TOOL.path,
    wraps: LIST_SHOP_ORDERS_TOOL.wraps,
    parameters: LIST_SHOP_ORDERS_TOOL.parameters,
  }
}

export function placeTestShopOrderToolCatalog() {
  return {
    name: PLACE_TEST_SHOP_ORDER_TOOL.name,
    aliases: [...PLACE_TEST_SHOP_ORDER_TOOL.aliases],
    description: PLACE_TEST_SHOP_ORDER_TOOL.description,
    method: PLACE_TEST_SHOP_ORDER_TOOL.method,
    path: PLACE_TEST_SHOP_ORDER_TOOL.path,
    wraps: PLACE_TEST_SHOP_ORDER_TOOL.wraps,
    parameters: PLACE_TEST_SHOP_ORDER_TOOL.parameters,
  }
}

export async function executeSetupShopCatalog(
  session: { gotrueId: string; email: string; projectRef: string },
  input: {
    brand?: string | null
    products?: Array<Record<string, unknown>> | null
    action?: string | null
  },
) {
  const result = await platformShopCatalog({
    gotrueId: session.gotrueId,
    email: session.email,
    workspaceRef: session.projectRef,
    action: input.action || 'setup',
    brand: input.brand,
    products: input.products,
  })
  return {
    ...result,
    tool: 'setupShopCatalog' as const,
    claim_catalog_ready: result.ok === true,
  }
}

export async function executeListShopOrders(
  session: { gotrueId: string; email: string; projectRef: string },
  input: { brand?: string | null },
) {
  const result = await platformShopOrders({
    gotrueId: session.gotrueId,
    email: session.email,
    workspaceRef: session.projectRef,
    action: 'list',
    brand: input.brand,
  })
  return {
    ...result,
    tool: 'listShopOrders' as const,
  }
}

export async function executePlaceTestShopOrder(
  session: { gotrueId: string; email: string; projectRef: string },
  input: {
    order_email?: string | null
    items?: Array<Record<string, unknown>> | null
    cleanup?: boolean | null
    brand?: string | null
  },
) {
  const result = await platformShopOrders({
    gotrueId: session.gotrueId,
    email: session.email,
    workspaceRef: session.projectRef,
    action: input.cleanup === false ? 'place' : 'test',
    brand: input.brand,
    orderEmail: input.order_email,
    items: input.items,
    cleanup: input.cleanup !== false,
  })
  return {
    ...result,
    tool: 'placeTestShopOrder' as const,
    claim_order_proven: result.ok === true,
  }
}
