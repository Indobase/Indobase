/**
 * Parse Indobase follow-up / choice chips from agent message text.
 *
 * General web-app path:
 *   classify app type → build → Go Live → ensureLogin / ensureDatabase / applySchema
 *   → payments (optional BYOK) → productionChecklist claim gate
 *
 * Ecommerce preset: setupShopCatalog + wireCheckout one_time.
 */

export type FollowUpItem = {
  label: string
  message: string
}

export type ParsedFollowUps = {
  /** Message with the follow-ups block stripped (for markdown). */
  body: string
  title: string
  items: FollowUpItem[]
}

const BLOCK_RE =
  /<<<INDOBASE_(FOLLOWUPS|CHOICES)\s*\r?\n([\s\S]*?)\r?\nINDOBASE_(FOLLOWUPS|CHOICES)>>>\s*/gi

export const DEFAULT_POST_BUILD_TITLE = 'Where should I take this next?'

/** Indobase-native next steps after preview / Go Live (never third-party hosts). */
export const DEFAULT_POST_BUILD_FOLLOWUPS: readonly FollowUpItem[] = [
  {
    label: 'Go Live on Indobase',
    message: 'Go Live — publish this business to my Indobase subdomain with launchBusiness',
  },
  {
    label: 'Connect my domain',
    message:
      'Connect a domain I already own — publish with customDomain and give me CNAME to sites.indobase.in',
  },
  {
    label: 'Add customer login',
    message: 'Call ensureLogin and wire a Sign-in CTA for this app',
  },
  {
    label: 'Add a real backend',
    message:
      'Call ensureDatabase then applySchema with the tables this app needs (or setupShopCatalog if it is a shop), then wire the UI to the project REST API',
  },
  {
    label: 'Add payments',
    message:
      'I want to connect payments — ask me India (Razorpay) vs International (Stripe), then connectGateway + wireCheckout',
  },
  {
    label: 'Production checklist',
    message:
      'Run productionChecklist for this app_type with the live_url and honest checks — only claim production ready if claim_production_ready is true',
  },
  {
    label: 'Refine the design',
    message: 'Refine the design and branding — polish layout, typography, and visuals',
  },
  {
    label: 'Leave it as-is for now',
    message: 'Looks good — leave it as-is for now',
  },
] as const

/** Classify what kind of web app before deep Lane-2 work. */
export const APP_TYPE_TITLE = 'What kind of web app is this?'

export const APP_TYPE_FOLLOWUPS: readonly FollowUpItem[] = [
  {
    label: 'Landing / marketing site',
    message:
      'This is a landing/marketing site — Go Live, SEO + legal, optional domain; productionChecklist app_type landing',
  },
  {
    label: 'SaaS / web app',
    message:
      'This is a SaaS web app — ensureLogin, ensureDatabase, applySchema for orgs/users, wire auth UI, then productionChecklist app_type saas',
  },
  {
    label: 'Ecommerce / store',
    message:
      'This is an ecommerce store — resolveProductImages, setupShopCatalog, payments (connectGateway + wireCheckout), admin_html once (live REST), productionChecklist app_type ecommerce',
  },
  {
    label: 'Booking / appointments',
    message:
      'This is a booking app — ensureLogin, applySchema for resources/slots/bookings, optional payments, productionChecklist app_type booking',
  },
  {
    label: 'Blog / content',
    message:
      'This is a blog/content site — applySchema for posts, SEO + legal, productionChecklist app_type blog',
  },
  {
    label: 'Dashboard / internal tool',
    message:
      'This is a dashboard/internal tool — ensureLogin, applySchema for entities, productionChecklist app_type dashboard',
  },
  {
    label: "I'll describe it",
    message: "I'll describe the web app so you can pick the right production path",
  },
] as const

/** Ask where customers pay before ensuring — maps to settlement_market. */
export const PAYMENTS_MARKET_TITLE = 'Where will customers pay?'

export const PAYMENTS_MARKET_FOLLOWUPS: readonly FollowUpItem[] = [
  {
    label: 'India (Razorpay)',
    message:
      'Connect payments for India with Razorpay — POST /api/os/runtime/ensure { capability: "payments", settlement_market: "india" }, send me to https://dashboard.razorpay.com to finish KYC and copy API keys, then call connectGateway with key_id + key_secret',
  },
  {
    label: 'International (Stripe)',
    message:
      'Connect payments internationally with Stripe — POST /api/os/runtime/ensure { capability: "payments", settlement_market: "international" }, send me to https://dashboard.stripe.com to finish verification and copy API keys, then call connectGateway with secret_key + publishable_key',
  },
  {
    label: "I'll describe my market",
    message:
      "I'll describe where my customers pay so you can choose Razorpay (India) or Stripe (international), send me to their dashboard for KYC/keys, then call connectGateway with my API keys",
  },
] as const

/**
 * After ensure pending_setup — KYC on PSP + paste keys + wire checkout.
 */
export const PAYMENTS_SETUP_TITLE = 'Finish payments setup'

export const PAYMENTS_SETUP_FOLLOWUPS: readonly FollowUpItem[] = [
  {
    label: 'Complete KYC on Razorpay/Stripe',
    message:
      'Send me to the Razorpay or Stripe dashboard (whichever rail we picked) to create the merchant account and finish KYC, then come back with API keys',
  },
  {
    label: 'Paste API keys',
    message:
      'I will paste my Razorpay or Stripe API keys — call connectGateway (POST /api/os/tools/connectGateway) with settlement_market and the keys so Indobase validates them and syncs the Payments connector',
  },
  {
    label: 'Wire checkout into the site',
    message:
      'Call wireCheckout (POST /api/os/tools/wireCheckout) with plan_name, price, currency, and customer_email — then set the site Subscribe/Buy CTA href to the returned checkout_url',
  },
  {
    label: 'Skip payments for now',
    message: 'Skip payments for now — leave checkout unfinished',
  },
] as const

export const PAYMENTS_LIVE_TITLE = 'Payments are live — what next?'

export const PAYMENTS_LIVE_FOLLOWUPS: readonly FollowUpItem[] = [
  {
    label: 'Wire checkout into the site',
    message:
      'Call wireCheckout (POST /api/os/tools/wireCheckout) with mode one_time or subscription, plan_name, price, currency, and customer_email — then set the site Subscribe/Buy CTA href to the returned checkout_url',
  },
  {
    label: 'Add shop catalog + admin',
    message:
      'Call resolveProductImages then setupShopCatalog with products + image_url, placeTestShopOrder, then publish admin_html once via launchBusiness as admin.html (live REST refresh)',
  },
  {
    label: 'Production checklist',
    message:
      'Finish the production site checklist — login if needed, SEO title/description, privacy/terms links, custom domain CNAME, and confirm checkout CTA uses wireCheckout checkout_url',
  },
  {
    label: 'Open Payments dashboard',
    message: 'Open the Indobase Payments dashboard for this business',
  },
  {
    label: 'Refine the design',
    message: 'Refine the design and branding — polish layout, typography, and visuals',
  },
  {
    label: 'Leave it as-is for now',
    message: 'Looks good — leave it as-is for now',
  },
] as const

/** After catalog/backend is live — Naïve-style next steps. */
export const SHOP_BACKEND_TITLE = 'Shop backend is live — what next?'

export const SHOP_BACKEND_FOLLOWUPS: readonly FollowUpItem[] = [
  {
    label: 'Wire storefront to this catalog',
    message:
      'Wire the storefront product grid to catalog_json from setupShopCatalog / listShopOrders and Buy buttons to wireCheckout mode one_time checkout_url',
  },
  {
    label: 'Publish admin dashboard',
    message:
      'Publish admin_html from listShopOrders via launchBusiness as admin.html once — it live-refreshes from project REST; do not republish just to refresh orders',
  },
  {
    label: 'Connect payments',
    message:
      'Connect payments — ask India vs International, ensure, PSP KYC, connectGateway, then wireCheckout',
  },
  {
    label: 'Leave it as-is for now',
    message: 'Looks good — leave it as-is for now',
  },
] as const

export function parseFollowUpLine(line: string): FollowUpItem | null {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('#')) return null
  if (/^title\s*:/i.test(trimmed)) return null

  const pipe = trimmed.indexOf('|')
  if (pipe === -1) {
    return { label: trimmed, message: trimmed }
  }

  const label = trimmed.slice(0, pipe).trim()
  const message = trimmed.slice(pipe + 1).trim() || label
  if (!label) return null
  return { label, message }
}

export function parseFollowUps(message: string): ParsedFollowUps | null {
  if (!message || !/<<<INDOBASE_(FOLLOWUPS|CHOICES)/i.test(message)) {
    return null
  }

  let title = DEFAULT_POST_BUILD_TITLE
  const items: FollowUpItem[] = []
  let body = message

  body = body.replace(BLOCK_RE, (_full, _open, inner: string) => {
    for (const rawLine of inner.split(/\r?\n/)) {
      const line = rawLine.trim()
      if (!line) continue
      const titleMatch = /^title\s*:\s*(.+)$/i.exec(line)
      if (titleMatch) {
        title = titleMatch[1].trim() || title
        continue
      }
      const item = parseFollowUpLine(line)
      if (item) items.push(item)
    }
    return ''
  })

  body = body.replace(/\n{3,}/g, '\n\n').trimEnd()

  if (items.length === 0) return null
  return { body, title, items }
}

/** Heuristic: finished build / preview / launch summary without explicit chips. */
export function looksLikeCompletedDeliverable(message: string): boolean {
  const text = message.toLowerCase()
  if (parseFollowUps(message)) return false
  if (
    looksLikePaymentsPending(message) ||
    looksLikePaymentsLive(message) ||
    looksLikePaymentsMarketAsk(message) ||
    looksLikeShopBackendReady(message) ||
    looksLikeAppTypeAsk(message)
  ) {
    return false
  }
  if (/sites\.indobase\.in|live preview|go live|is now live|here's what i built|here is what i built/.test(text)) {
    return true
  }
  if (/where do you want to take|what('s| is) next|take it from here/.test(text)) {
    return true
  }
  return false
}

/** Agent is asking India vs international / Razorpay vs Stripe before ensure. */
export function looksLikePaymentsMarketAsk(message: string): boolean {
  const text = message.toLowerCase()
  if (/payments are live|finish checkout setup|payments backend is ready/.test(text)) {
    return false
  }
  return (
    /where will customers pay|where (will|do|should).*(customer|buyer|people).*pay|india.*(razorpay|or|vs).*stripe|stripe.*(or|vs).*razorpay|razorpay.*stripe|which (payment|settlement) (rail|market)|india \(razorpay\)|international \(stripe\)/.test(
      text
    )
  )
}

/** Enable payments returned pending / finish-setup. */
export function looksLikePaymentsPending(message: string): boolean {
  const text = message.toLowerCase()
  if (/payments are live/.test(text)) return false
  return (
    /finish checkout setup|payments backend is ready|pending_setup|merchant (kyc|verification|onboarding)|confirm go-live|launch_url|checkout setup|india settlements selected|international cards selected|connect gateway|paste (api )?keys|complete kyc on (razorpay|stripe)/.test(
      text
    ) && /payment/.test(text)
  )
}

export function looksLikePaymentsLive(message: string): boolean {
  return /payments are live/.test(message.toLowerCase())
}

/** Agent is asking what kind of app / product. */
export function looksLikeAppTypeAsk(message: string): boolean {
  const text = message.toLowerCase()
  if (/where will customers pay|payments are live|finish payments/.test(text)) return false
  return /what kind of (web )?app|saas or (shop|store|ecommerce)|landing or saas|booking or blog|what are we building/.test(
    text,
  )
}

/** Agent finished setupShopCatalog / placeTestShopOrder. */
export function looksLikeShopBackendReady(message: string): boolean {
  const text = message.toLowerCase()
  if (/payments are live|finish payments setup/.test(text)) return false
  return (
    /shop catalog ready|catalog:\s*\d+\s*products|test order .* verified|admin_html|units in stock|real backend/.test(
      text,
    ) && /product|catalog|inventory|order|admin/.test(text)
  )
}

export function resolveFollowUps(message: string): ParsedFollowUps | null {
  const parsed = parseFollowUps(message)
  if (parsed) return parsed

  if (looksLikePaymentsLive(message)) {
    return {
      body: message,
      title: PAYMENTS_LIVE_TITLE,
      items: [...PAYMENTS_LIVE_FOLLOWUPS],
    }
  }

  if (looksLikeShopBackendReady(message)) {
    return {
      body: message,
      title: SHOP_BACKEND_TITLE,
      items: [...SHOP_BACKEND_FOLLOWUPS],
    }
  }

  if (looksLikeAppTypeAsk(message)) {
    return {
      body: message,
      title: APP_TYPE_TITLE,
      items: [...APP_TYPE_FOLLOWUPS],
    }
  }

  if (looksLikePaymentsPending(message)) {
    return {
      body: message,
      title: PAYMENTS_SETUP_TITLE,
      items: [...PAYMENTS_SETUP_FOLLOWUPS],
    }
  }

  if (looksLikePaymentsMarketAsk(message)) {
    return {
      body: message,
      title: PAYMENTS_MARKET_TITLE,
      items: [...PAYMENTS_MARKET_FOLLOWUPS],
    }
  }

  if (!looksLikeCompletedDeliverable(message)) return null
  return {
    body: message,
    title: DEFAULT_POST_BUILD_TITLE,
    items: [...DEFAULT_POST_BUILD_FOLLOWUPS],
  }
}

/** Serialize a follow-ups block for agent replies / tests. */
export function formatFollowUpsBlock(title: string, items: readonly FollowUpItem[]): string {
  const lines = [`<<<INDOBASE_FOLLOWUPS`, `title: ${title}`]
  for (const item of items) {
    lines.push(`${item.label} | ${item.message}`)
  }
  lines.push('INDOBASE_FOLLOWUPS>>>')
  return lines.join('\n')
}
