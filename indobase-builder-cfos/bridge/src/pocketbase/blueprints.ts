/**
 * Product-backend blueprints — starter boilerplate for agent-built apps.
 * Agents should seed a blueprint, then customize with applySchema tables for the customer's product.
 */

export type BlueprintId = 'saas' | 'ecommerce' | 'booking' | 'blog' | 'dashboard'

export type RuleProfile =
  | 'owner'
  | 'authenticated'
  | 'public_read_auth_write'
  | 'public_read_admin_write'
  | 'admin_only'
  | 'members_of_org'

export type CollectionRules = {
  listRule: string | null
  viewRule: string | null
  createRule: string | null
  updateRule: string | null
  deleteRule: string | null
}

export type BlueprintField = {
  name: string
  type: string
  required?: boolean
}

export type BlueprintCollection = {
  name: string
  fields: BlueprintField[]
  /** Authz profile — never open write by default. */
  rules: RuleProfile
}

export type BackendBlueprint = {
  id: BlueprintId
  label: string
  collections: BlueprintCollection[]
}

/** PocketBase: empty string = public; null = admin-only; expression = filtered. */
export function rulesForProfile(profile: RuleProfile): CollectionRules {
  switch (profile) {
    case 'owner':
      // PocketBase rejects @request.data.* in API rules; use record field names
      // (or @request.body.*) so createRule validates against the submitted row.
      return {
        listRule: '@request.auth.id != "" && owner = @request.auth.id',
        viewRule: '@request.auth.id != "" && owner = @request.auth.id',
        createRule: '@request.auth.id != "" && owner = @request.auth.id',
        updateRule: '@request.auth.id != "" && owner = @request.auth.id',
        deleteRule: '@request.auth.id != "" && owner = @request.auth.id',
      }
    case 'authenticated':
      return {
        listRule: '@request.auth.id != ""',
        viewRule: '@request.auth.id != ""',
        createRule: '@request.auth.id != ""',
        updateRule: '@request.auth.id != ""',
        deleteRule: '@request.auth.id != ""',
      }
    case 'public_read_auth_write':
      return {
        listRule: '',
        viewRule: '',
        createRule: '@request.auth.id != ""',
        updateRule: '@request.auth.id != ""',
        deleteRule: '@request.auth.id != ""',
      }
    case 'public_read_admin_write':
      // Catalog readable by storefront; mutations only via admin (Commerce / guidedBackend).
      return {
        listRule: '',
        viewRule: '',
        createRule: null,
        updateRule: null,
        deleteRule: null,
      }
    case 'admin_only':
      // Transactional domains (orders, reservations) — CheckoutService via admin token only.
      return {
        listRule: null,
        viewRule: null,
        createRule: null,
        updateRule: null,
        deleteRule: null,
      }
    case 'members_of_org':
      // Org-scoped: require auth + non-empty org_id; writes owned by caller.
      return {
        listRule: '@request.auth.id != "" && org_id != ""',
        viewRule: '@request.auth.id != "" && org_id != ""',
        createRule: '@request.auth.id != "" && owner = @request.auth.id && org_id != ""',
        updateRule: '@request.auth.id != "" && owner = @request.auth.id && org_id != ""',
        deleteRule: '@request.auth.id != "" && owner = @request.auth.id && org_id != ""',
      }
    default:
      return {
        listRule: null,
        viewRule: null,
        createRule: null,
        updateRule: null,
        deleteRule: null,
      }
  }
}

/** True when create/update/delete is world-open (unsafe for customer apps). */
export function isOpenWriteRule(rule: string | null | undefined): boolean {
  if (rule === null || rule === undefined) return false
  const trimmed = rule.trim()
  if (trimmed === '') return true
  const normalized = trimmed.toLowerCase().replace(/\s+/g, '')
  // Common allow-all / always-true expressions agents might invent.
  if (
    normalized === 'true' ||
    normalized === '1=1' ||
    normalized === '1==1' ||
    normalized === '@request.auth.id!=""||true' ||
    normalized === '""=""'
  ) {
    return true
  }
  return false
}

export function isSecureWriteRules(rules: CollectionRules): boolean {
  return (
    !isOpenWriteRule(rules.createRule) &&
    !isOpenWriteRule(rules.updateRule) &&
    !isOpenWriteRule(rules.deleteRule)
  )
}

const OWNER: BlueprintField = { name: 'owner', type: 'text', required: true }
const ORG_ID: BlueprintField = { name: 'org_id', type: 'text', required: true }
const CREATED: BlueprintField = { name: 'created_at', type: 'date' }

export const BACKEND_BLUEPRINTS: Record<BlueprintId, BackendBlueprint> = {
  saas: {
    id: 'saas',
    label: 'SaaS / web app',
    collections: [
      {
        name: 'organizations',
        fields: [
          OWNER,
          { name: 'name', type: 'text', required: true },
          { name: 'slug', type: 'text', required: true },
          CREATED,
        ],
        rules: 'owner',
      },
      {
        name: 'memberships',
        fields: [
          OWNER,
          ORG_ID,
          { name: 'user_id', type: 'text', required: true },
          { name: 'role', type: 'text', required: true },
          CREATED,
        ],
        rules: 'owner',
      },
      {
        name: 'projects',
        fields: [
          OWNER,
          ORG_ID,
          { name: 'name', type: 'text', required: true },
          { name: 'status', type: 'text' },
          CREATED,
        ],
        rules: 'members_of_org',
      },
    ],
  },
  ecommerce: {
    id: 'ecommerce',
    label: 'Ecommerce / store',
    /**
     * Physical collection names: ib_{sanitizeAppId(projectRef)}_{logicalName}
     * Canonical field names (do not rename without fleet migration):
     *   products — name, slug, price, currency, stock, image_url, active, owner
     *   orders — email, status, total, currency, items_json, owner
     *   order_items — order_id, product_slug, quantity, unit_price, owner
     * Spec aliases (docs only): title→name, inventory→stock, customer_email→email
     */
    collections: [
      {
        name: 'products',
        fields: [
          OWNER,
          { name: 'slug', type: 'text', required: true },
          { name: 'name', type: 'text', required: true },
          { name: 'description', type: 'text' },
          { name: 'price', type: 'number', required: true },
          { name: 'currency', type: 'text' },
          { name: 'stock', type: 'number' },
          { name: 'image_url', type: 'text' },
          { name: 'active', type: 'bool' },
          CREATED,
        ],
        rules: 'public_read_admin_write',
      },
      {
        name: 'orders',
        fields: [
          OWNER,
          { name: 'email', type: 'email', required: true },
          { name: 'customer_name', type: 'text' },
          { name: 'status', type: 'text', required: true },
          { name: 'payment_status', type: 'text' },
          { name: 'total', type: 'number' },
          { name: 'amount_minor', type: 'number' },
          { name: 'subtotal_minor', type: 'number' },
          { name: 'currency', type: 'text' },
          { name: 'items_json', type: 'json' },
          { name: 'idempotency_key', type: 'text' },
          { name: 'payment_url', type: 'text' },
          { name: 'provider_event_id', type: 'text' },
          { name: 'reservation_expires_at', type: 'date' },
          { name: 'shipping_address', type: 'json' },
          CREATED,
        ],
        // Mutations only via Commerce CheckoutService (admin). Public API denied.
        rules: 'admin_only',
      },
      {
        name: 'order_items',
        fields: [
          OWNER,
          { name: 'order_id', type: 'text', required: true },
          { name: 'product_slug', type: 'text', required: true },
          { name: 'product_id', type: 'text' },
          { name: 'quantity', type: 'number', required: true },
          { name: 'unit_price', type: 'number' },
          { name: 'unit_price_minor', type: 'number' },
          CREATED,
        ],
        rules: 'admin_only',
      },
      {
        name: 'inventory_reservations',
        fields: [
          OWNER,
          { name: 'order_id', type: 'text', required: true },
          { name: 'product_id', type: 'text', required: true },
          { name: 'quantity', type: 'number', required: true },
          { name: 'status', type: 'text', required: true },
          { name: 'expires_at', type: 'date', required: true },
          CREATED,
        ],
        rules: 'admin_only',
      },
    ],
  },
  booking: {
    id: 'booking',
    label: 'Booking / appointments',
    collections: [
      {
        name: 'resources',
        fields: [
          OWNER,
          { name: 'name', type: 'text', required: true },
          { name: 'timezone', type: 'text' },
          { name: 'active', type: 'bool' },
          CREATED,
        ],
        rules: 'owner',
      },
      {
        name: 'slots',
        fields: [
          OWNER,
          { name: 'resource_id', type: 'text', required: true },
          { name: 'starts_at', type: 'date', required: true },
          { name: 'ends_at', type: 'date', required: true },
          { name: 'capacity', type: 'number' },
          CREATED,
        ],
        rules: 'public_read_auth_write',
      },
      {
        name: 'bookings',
        fields: [
          OWNER,
          { name: 'slot_id', type: 'text', required: true },
          { name: 'customer_email', type: 'email', required: true },
          { name: 'customer_name', type: 'text' },
          { name: 'status', type: 'text', required: true },
          CREATED,
        ],
        rules: 'owner',
      },
    ],
  },
  blog: {
    id: 'blog',
    label: 'Blog / content',
    collections: [
      {
        name: 'posts',
        fields: [
          OWNER,
          { name: 'slug', type: 'text', required: true },
          { name: 'title', type: 'text', required: true },
          { name: 'body', type: 'text' },
          { name: 'status', type: 'text', required: true },
          { name: 'published_at', type: 'date' },
          CREATED,
        ],
        rules: 'public_read_auth_write',
      },
      {
        name: 'tags',
        fields: [OWNER, { name: 'name', type: 'text', required: true }, { name: 'slug', type: 'text', required: true }],
        rules: 'authenticated',
      },
    ],
  },
  dashboard: {
    id: 'dashboard',
    label: 'Dashboard / internal tool',
    collections: [
      {
        name: 'organizations',
        fields: [OWNER, { name: 'name', type: 'text', required: true }, { name: 'slug', type: 'text', required: true }, CREATED],
        rules: 'owner',
      },
      {
        name: 'metrics_events',
        fields: [
          OWNER,
          ORG_ID,
          { name: 'name', type: 'text', required: true },
          { name: 'value', type: 'number' },
          { name: 'payload', type: 'json' },
          CREATED,
        ],
        rules: 'members_of_org',
      },
    ],
  },
}

export function resolveBlueprintId(raw: string | null | undefined): BlueprintId {
  const t = (raw || '').trim().toLowerCase()
  if (t === 'ecommerce' || t === 'shop' || t === 'store' || t === 'commerce') return 'ecommerce'
  if (t === 'booking' || t === 'appointments' || t === 'scheduling') return 'booking'
  if (t === 'blog' || t === 'content' || t === 'cms') return 'blog'
  if (t === 'dashboard' || t === 'admin' || t === 'internal') return 'dashboard'
  if (t === 'saas' || t === 'software' || t === 'b2b' || t === 'generic') return 'saas'
  return 'saas'
}

export function getBlueprint(id: BlueprintId | string | null | undefined): BackendBlueprint {
  const resolved = resolveBlueprintId(typeof id === 'string' ? id : id || 'saas')
  return BACKEND_BLUEPRINTS[resolved]
}

/** Map legacy declarative tables (applySchema) into a blueprint id when possible. */
export function inferBlueprintFromTables(tables: Array<Record<string, unknown>> | null | undefined): BlueprintId {
  const names = (tables || [])
    .map((t) => (typeof t.name === 'string' ? t.name.toLowerCase() : ''))
    .filter(Boolean)
  if (names.some((n) => n.includes('product') || n.includes('order'))) return 'ecommerce'
  if (names.some((n) => n.includes('booking') || n.includes('slot'))) return 'booking'
  if (names.some((n) => n.includes('post') || n.includes('tag'))) return 'blog'
  if (names.some((n) => n.includes('metric'))) return 'dashboard'
  return 'saas'
}
