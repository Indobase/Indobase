/**
 * Fixed vertical chip catalog for Indobase OS (CFOS).
 * Agents must not invent the matrix — seed + copy come from this list.
 */

export type VerticalSeedProduct = {
  slug: string
  name: string
  description: string
  price: string
  currency: string
  stock: number
  /** Search query for resolveProductImages */
  image_query: string
}

export type AppVertical = {
  id: string
  /** Chip label shown to the operator */
  label: string
  /** App types this niche applies to */
  app_types: ReadonlyArray<'ecommerce' | 'saas' | 'booking' | 'blog' | 'landing' | 'dashboard'>
  /** Short brand/copy hint for the agent */
  copy_hint: string
  products?: readonly VerticalSeedProduct[]
}

/** Ecommerce store verticals — Apparel-style fixed factory (not LLM-invented). */
export const ECOMMERCE_VERTICALS: readonly AppVertical[] = [
  {
    id: 'apparel',
    label: 'Apparel / fashion',
    app_types: ['ecommerce'],
    copy_hint: 'Modern apparel storefront — clean product grid, size-aware copy, seasonal drops.',
    products: [
      {
        slug: 'wool-overcoat',
        name: 'Wool Overcoat',
        description: 'Tailored wool overcoat with satin lining.',
        price: '4800',
        currency: 'INR',
        stock: 24,
        image_query: 'wool overcoat fashion',
      },
      {
        slug: 'linen-shirt',
        name: 'Linen Shirt',
        description: 'Breathable everyday linen shirt.',
        price: '1899',
        currency: 'INR',
        stock: 48,
        image_query: 'linen shirt apparel',
      },
      {
        slug: 'denim-jacket',
        name: 'Denim Jacket',
        description: 'Classic mid-wash denim jacket.',
        price: '2499',
        currency: 'INR',
        stock: 36,
        image_query: 'denim jacket fashion',
      },
      {
        slug: 'leather-tote',
        name: 'Leather Tote',
        description: 'Full-grain leather everyday tote.',
        price: '3999',
        currency: 'INR',
        stock: 18,
        image_query: 'leather tote bag',
      },
    ],
  },
  {
    id: 'electronics',
    label: 'Electronics',
    app_types: ['ecommerce'],
    copy_hint: 'Gadget store — specs-forward cards, warranty-friendly copy.',
    products: [
      {
        slug: 'wireless-earbuds',
        name: 'Wireless Earbuds',
        description: 'Noise-aware earbuds with USB-C case.',
        price: '2999',
        currency: 'INR',
        stock: 60,
        image_query: 'wireless earbuds product',
      },
      {
        slug: 'usb-c-hub',
        name: 'USB-C Hub',
        description: '7-in-1 aluminum USB-C hub.',
        price: '2199',
        currency: 'INR',
        stock: 40,
        image_query: 'usb-c hub aluminum',
      },
      {
        slug: 'portable-ssd',
        name: 'Portable SSD 1TB',
        description: 'Compact 1TB portable SSD.',
        price: '7499',
        currency: 'INR',
        stock: 28,
        image_query: 'portable ssd drive',
      },
      {
        slug: 'desk-lamp',
        name: 'LED Desk Lamp',
        description: 'Adjustable LED desk lamp.',
        price: '1599',
        currency: 'INR',
        stock: 45,
        image_query: 'led desk lamp',
      },
    ],
  },
  {
    id: 'food-grocery',
    label: 'Food & grocery',
    app_types: ['ecommerce'],
    copy_hint: 'Grocery / specialty food — freshness cues, pack sizes, delivery-ready copy.',
    products: [
      {
        slug: 'organic-basmati',
        name: 'Organic Basmati Rice 5kg',
        description: 'Aged organic basmati rice.',
        price: '899',
        currency: 'INR',
        stock: 80,
        image_query: 'basmati rice bag',
      },
      {
        slug: 'cold-pressed-oil',
        name: 'Cold-Pressed Oil 1L',
        description: 'Cold-pressed cooking oil.',
        price: '649',
        currency: 'INR',
        stock: 55,
        image_query: 'cooking oil bottle',
      },
      {
        slug: 'spice-box',
        name: 'Everyday Spice Box',
        description: 'Eight-spice starter kit.',
        price: '499',
        currency: 'INR',
        stock: 70,
        image_query: 'indian spices box',
      },
      {
        slug: 'filter-coffee',
        name: 'Filter Coffee 500g',
        description: 'South Indian filter coffee blend.',
        price: '399',
        currency: 'INR',
        stock: 90,
        image_query: 'filter coffee powder',
      },
    ],
  },
  {
    id: 'beauty',
    label: 'Beauty',
    app_types: ['ecommerce'],
    copy_hint: 'Beauty / personal care — clean ingredient-led product cards.',
    products: [
      {
        slug: 'vitamin-c-serum',
        name: 'Vitamin C Serum',
        description: 'Brightening daily serum.',
        price: '1299',
        currency: 'INR',
        stock: 42,
        image_query: 'vitamin c serum bottle',
      },
      {
        slug: 'clay-mask',
        name: 'Clay Face Mask',
        description: 'Purifying clay face mask.',
        price: '799',
        currency: 'INR',
        stock: 50,
        image_query: 'clay face mask jar',
      },
      {
        slug: 'spf-moisturizer',
        name: 'SPF 50 Moisturizer',
        description: 'Daily SPF moisturizer.',
        price: '999',
        currency: 'INR',
        stock: 38,
        image_query: 'sunscreen moisturizer tube',
      },
      {
        slug: 'lip-balm-set',
        name: 'Lip Balm Set',
        description: 'Three-shade nourishing lip balm set.',
        price: '549',
        currency: 'INR',
        stock: 65,
        image_query: 'lip balm set',
      },
    ],
  },
  {
    id: 'home',
    label: 'Home',
    app_types: ['ecommerce'],
    copy_hint: 'Home & living — warm lifestyle photography, room-ready copy.',
    products: [
      {
        slug: 'ceramic-vase',
        name: 'Ceramic Vase',
        description: 'Hand-glazed ceramic vase.',
        price: '1799',
        currency: 'INR',
        stock: 22,
        image_query: 'ceramic vase home decor',
      },
      {
        slug: 'cotton-duvet',
        name: 'Cotton Duvet Cover',
        description: 'Soft cotton duvet cover set.',
        price: '2499',
        currency: 'INR',
        stock: 30,
        image_query: 'cotton duvet bedding',
      },
      {
        slug: 'scented-candle',
        name: 'Scented Candle',
        description: 'Soy wax scented candle.',
        price: '699',
        currency: 'INR',
        stock: 58,
        image_query: 'scented candle jar',
      },
      {
        slug: 'oak-shelf',
        name: 'Oak Wall Shelf',
        description: 'Solid oak floating shelf.',
        price: '3299',
        currency: 'INR',
        stock: 16,
        image_query: 'oak floating shelf',
      },
    ],
  },
  {
    id: 'sports',
    label: 'Sports & outdoors',
    app_types: ['ecommerce'],
    copy_hint: 'Sports / outdoors — performance-forward product cards.',
    products: [
      {
        slug: 'yoga-mat',
        name: 'Yoga Mat',
        description: 'Non-slip yoga mat.',
        price: '1299',
        currency: 'INR',
        stock: 44,
        image_query: 'yoga mat rolled',
      },
      {
        slug: 'resistance-bands',
        name: 'Resistance Bands',
        description: 'Set of five resistance bands.',
        price: '799',
        currency: 'INR',
        stock: 60,
        image_query: 'resistance bands set',
      },
      {
        slug: 'running-bottle',
        name: 'Running Bottle 750ml',
        description: 'Lightweight running water bottle.',
        price: '599',
        currency: 'INR',
        stock: 72,
        image_query: 'sports water bottle',
      },
      {
        slug: 'daypack',
        name: 'Daypack 20L',
        description: 'Lightweight outdoor daypack.',
        price: '2199',
        currency: 'INR',
        stock: 26,
        image_query: 'hiking daypack',
      },
    ],
  },
] as const

/** Sensible niches for non-shop app types (chips only — schema defaults elsewhere). */
export const APP_TYPE_NICHES: readonly AppVertical[] = [
  {
    id: 'saas-b2b',
    label: 'B2B SaaS',
    app_types: ['saas'],
    copy_hint: 'Org/membership SaaS — ensureLogin + applySchema orgs/memberships.',
  },
  {
    id: 'saas-consumer',
    label: 'Consumer app',
    app_types: ['saas'],
    copy_hint: 'Consumer web app — accounts + core entities via applySchema.',
  },
  {
    id: 'booking-clinic',
    label: 'Clinic / salon',
    app_types: ['booking'],
    copy_hint: 'Appointments — resources, slots, bookings schema.',
  },
  {
    id: 'booking-classes',
    label: 'Classes / tutoring',
    app_types: ['booking'],
    copy_hint: 'Class booking — resources, slots, bookings.',
  },
  {
    id: 'blog-magazine',
    label: 'Magazine / blog',
    app_types: ['blog'],
    copy_hint: 'Content site — posts + tags schema, SEO + legal.',
  },
  {
    id: 'landing-launch',
    label: 'Product launch',
    app_types: ['landing'],
    copy_hint: 'Marketing landing — Go Live, SEO + legal; optional domain.',
  },
  {
    id: 'dashboard-ops',
    label: 'Ops dashboard',
    app_types: ['dashboard'],
    copy_hint: 'Internal tool — ensureLogin + entities schema.',
  },
] as const

export const ECOMMERCE_VERTICAL_TITLE = 'What will your store sell?'

/** Default SaaS tables when “Add a real backend” is clicked for a non-shop app. */
export const DEFAULT_GENERIC_SCHEMA_TABLES: Array<Record<string, unknown>> = [
  {
    name: 'organizations',
    columns: [
      { name: 'id', type: 'uuid', primary_key: true, default: 'gen_random_uuid()' },
      { name: 'name', type: 'text', required: true },
      { name: 'slug', type: 'text', unique: true, required: true },
      { name: 'created_at', type: 'timestamptz', default: 'now()' },
    ],
    authenticated_write: true,
  },
  {
    name: 'memberships',
    columns: [
      { name: 'id', type: 'uuid', primary_key: true, default: 'gen_random_uuid()' },
      { name: 'org_id', type: 'uuid', required: true },
      { name: 'user_id', type: 'uuid', required: true },
      { name: 'role', type: 'text', required: true, default: "'member'" },
      { name: 'created_at', type: 'timestamptz', default: 'now()' },
    ],
    authenticated_write: true,
  },
]

export function findEcommerceVertical(raw: string | null | undefined): AppVertical | null {
  const q = (raw || '').trim().toLowerCase()
  if (!q) return null
  for (const v of ECOMMERCE_VERTICALS) {
    if (v.id === q) return v
    if (v.label.toLowerCase() === q) return v
    if (q.includes(v.id)) return v
    // Apparel / fashion → apparel
    const first = v.label.split('/')[0]?.trim().toLowerCase()
    if (first && q.includes(first)) return v
  }
  return null
}

export function ecommerceVerticalFollowups(
  brand?: string | null,
  opts?: { autoChain?: boolean },
): {
  title: string
  items: Array<{ label: string; message: string }>
} {
  const brandBit = brand?.trim() ? ` named ${brand.trim()}` : ''
  const brandArg = brand?.trim() ? ` brand=${brand.trim()}` : ''
  const autoChain = Boolean(opts?.autoChain)
  return {
    title: autoChain
      ? brand?.trim()
        ? `Launch ${brand.trim()} — full backend path`
        : 'Launch your store — pick a niche'
      : ECOMMERCE_VERTICAL_TITLE,
    items: [
      ...ECOMMERCE_VERTICALS.map((v) => ({
        label: v.label,
        message: autoChain
          ? `Launch ${v.label} store — INDOBASE_GUIDED_BACKEND mode=ecommerce vertical=${v.id}${brandArg} place_test_order=true — seed catalog, prove with placeTestShopOrder, wire storefront to session.backend, then emit Go Live chips`
          : `Niche ${v.label}${brandBit} — invent brand + aesthetic, build a preview storefront with localStorage cart (vertical=${v.id}). ` +
            `Do NOT call guidedBackend yet. After preview, emit Go Live–first FOLLOWUPS and keep advancing the launch ladder until live url + payments path.`,
      })),
      {
        label: "I'll type my specific niche",
        message: autoChain
          ? `I'll type my specific niche — INDOBASE_GUIDED_BACKEND mode=ecommerce place_test_order=true${brandArg} — seed catalog, prove order, wire storefront, then Go Live`
          : "I'll type my specific niche — invent brand + build preview storefront with localStorage cart; do NOT call guidedBackend until I pick Add a real backend",
      },
    ],
  }
}

export function formatEcommerceVerticalChoicesBlock(
  brand?: string | null,
  opts?: { autoChain?: boolean },
): string {
  const { title, items } = ecommerceVerticalFollowups(brand, opts)
  const lines = [`<<<INDOBASE_CHOICES`, `title: ${title}`]
  for (const item of items) {
    lines.push(`${item.label} | ${item.message}`)
  }
  lines.push('INDOBASE_CHOICES>>>')
  return lines.join('\n')
}
