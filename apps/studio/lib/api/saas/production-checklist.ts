/**
 * Production-ready claim gate for any web app type.
 * Agents may only say "production ready" when claim_production_ready is true.
 */

export type AppType =
  | 'landing'
  | 'saas'
  | 'ecommerce'
  | 'booking'
  | 'blog'
  | 'dashboard'
  | 'other'

export type ProductionCheckFlags = {
  /** launchBusiness returned a live URL and site is published */
  live_url?: boolean | null
  /** Login enabled + Sign-in CTA wired (required for saas/booking/dashboard when true need) */
  login_wired?: boolean | null
  /** applySchema or setupShopCatalog completed for apps that need a data model */
  schema_applied?: boolean | null
  /** wireCheckout CTA wired when payments matter */
  checkout_wired?: boolean | null
  /** title + meta description + H1 */
  seo_basics?: boolean | null
  /** Privacy + Terms links */
  legal_links?: boolean | null
  /** Optional custom domain CNAME */
  custom_domain?: boolean | null
}

export type ProductionChecklistInput = {
  app_type?: string | null
  live_url?: string | null
  brand?: string | null
  checks?: ProductionCheckFlags | null
}

export type ProductionCheckItem = {
  id: string
  required: boolean
  passed: boolean
  label: string
}

export type ProductionChecklistResult = {
  ok: boolean
  claim_production_ready: boolean
  app_type: AppType
  live_url?: string
  message: string
  checks: ProductionCheckItem[]
  missing: string[]
  next_steps: Array<{ id: string; label: string }>
}

export function normalizeAppType(raw: string | null | undefined): AppType {
  const t = (raw || 'other').trim().toLowerCase()
  if (t === 'landing' || t === 'marketing' || t === 'static') return 'landing'
  if (t === 'saas' || t === 'software' || t === 'b2b') return 'saas'
  if (t === 'ecommerce' || t === 'shop' || t === 'store' || t === 'commerce') return 'ecommerce'
  if (t === 'booking' || t === 'appointments' || t === 'scheduling') return 'booking'
  if (t === 'blog' || t === 'content' || t === 'cms') return 'blog'
  if (t === 'dashboard' || t === 'admin' || t === 'internal') return 'dashboard'
  return 'other'
}

function requiredFor(appType: AppType): {
  live_url: boolean
  login_wired: boolean
  schema_applied: boolean
  checkout_wired: boolean
  seo_basics: boolean
  legal_links: boolean
} {
  switch (appType) {
    case 'landing':
      return {
        live_url: true,
        login_wired: false,
        schema_applied: false,
        checkout_wired: false,
        seo_basics: true,
        legal_links: true,
      }
    case 'saas':
      return {
        live_url: true,
        login_wired: true,
        schema_applied: true,
        checkout_wired: false,
        seo_basics: true,
        legal_links: true,
      }
    case 'ecommerce':
      return {
        live_url: true,
        login_wired: false,
        schema_applied: true,
        checkout_wired: true,
        seo_basics: true,
        legal_links: true,
      }
    case 'booking':
      return {
        live_url: true,
        login_wired: true,
        schema_applied: true,
        checkout_wired: false,
        seo_basics: true,
        legal_links: true,
      }
    case 'blog':
      return {
        live_url: true,
        login_wired: false,
        schema_applied: true,
        checkout_wired: false,
        seo_basics: true,
        legal_links: true,
      }
    case 'dashboard':
      return {
        live_url: true,
        login_wired: true,
        schema_applied: true,
        checkout_wired: false,
        seo_basics: false,
        legal_links: false,
      }
    default:
      return {
        live_url: true,
        login_wired: false,
        schema_applied: false,
        checkout_wired: false,
        seo_basics: true,
        legal_links: true,
      }
  }
}

const LABELS: Record<string, string> = {
  live_url: 'Live on Indobase (launchBusiness url)',
  login_wired: 'Customer login enabled and Sign-in CTA wired',
  schema_applied: 'Data model applied (applySchema or setupShopCatalog)',
  checkout_wired: 'Real checkout CTA (wireCheckout checkout_url)',
  seo_basics: 'SEO basics (title, meta description, H1)',
  legal_links: 'Privacy + Terms links in footer',
  custom_domain: 'Custom domain CNAME (optional)',
}

export function evaluateProductionChecklist(
  input: ProductionChecklistInput
): ProductionChecklistResult {
  const appType = normalizeAppType(input.app_type)
  const req = requiredFor(appType)
  const flags = input.checks || {}
  const liveUrl =
    typeof input.live_url === 'string' && input.live_url.trim().startsWith('http')
      ? input.live_url.trim()
      : undefined

  const livePassed = Boolean(flags.live_url) && Boolean(liveUrl)
  const items: ProductionCheckItem[] = [
    {
      id: 'live_url',
      required: req.live_url,
      passed: livePassed,
      label: LABELS.live_url,
    },
    {
      id: 'login_wired',
      required: req.login_wired,
      passed: flags.login_wired === true,
      label: LABELS.login_wired,
    },
    {
      id: 'schema_applied',
      required: req.schema_applied,
      passed: flags.schema_applied === true,
      label: LABELS.schema_applied,
    },
    {
      id: 'checkout_wired',
      required: req.checkout_wired,
      passed: flags.checkout_wired === true,
      label: LABELS.checkout_wired,
    },
    {
      id: 'seo_basics',
      required: req.seo_basics,
      passed: flags.seo_basics === true,
      label: LABELS.seo_basics,
    },
    {
      id: 'legal_links',
      required: req.legal_links,
      passed: flags.legal_links === true,
      label: LABELS.legal_links,
    },
    {
      id: 'custom_domain',
      required: false,
      passed: flags.custom_domain === true,
      label: LABELS.custom_domain,
    },
  ]

  const missing = items.filter((i) => i.required && !i.passed).map((i) => i.id)
  const claim = missing.length === 0

  const next_steps = missing.map((id) => ({
    id,
    label:
      id === 'live_url'
        ? 'Call launchBusiness and quote the live url'
        : id === 'login_wired'
          ? 'Call ensureLogin and wire a Sign-in CTA'
          : id === 'schema_applied'
            ? 'Call applySchema (or setupShopCatalog for shops) for the app data model'
            : id === 'checkout_wired'
              ? 'Call connectGateway then wireCheckout; patch Buy/Subscribe CTA'
              : id === 'seo_basics'
                ? 'Add title, meta description, and brand H1 on the live site'
                : id === 'legal_links'
                  ? 'Add Privacy + Terms footer links (DPDP-aware)'
                  : LABELS[id] || id,
  }))

  return {
    ok: true,
    claim_production_ready: claim,
    app_type: appType,
    live_url: liveUrl,
    message: claim
      ? `Production ready for ${appType}${liveUrl ? ` — ${liveUrl}` : ''}. Only claim this after quoting these checks.`
      : `Not production ready for ${appType} — missing: ${missing.join(', ')}`,
    checks: items,
    missing,
    next_steps,
  }
}
