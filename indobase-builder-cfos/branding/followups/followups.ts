/**
 * Parse Indobase follow-up / choice chips from agent message text.
 *
 * Product policy (goal → gate → build → cards):
 *   1. Clear build ask → ack (+ guest gate if unsigned-in)
 *   2. Guest gate → name/email/DPDP/OTP only — NO chips
 *   3. Building → at most goal-tied CHOICES the agent emits (if blocked)
 *   4. Deliverable ready → agent-authored FOLLOWUPS only
 *   5. Capability path → agent-authored CHOICES for that path
 *
 * Cards are ALWAYS agent-authored (<<<INDOBASE_FOLLOWUPS>>> / CHOICES).
 * The UI never invents a predetermined catalog — no block → no cards.
 *
 * Timing is enforced by a thin deterministic stage gate (Naive-style):
 * guest_gate → none | building → goal CHOICES only (strip canned walls) |
 * payments / deliverable → show agent chips, max 4.
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

/** Conversation stage for chip timing (not a ranking algorithm). */
export type ChipStage = 'guest_gate' | 'building' | 'payments' | 'deliverable'

/** Naive-style brevity: never show a wall of chips. */
export const MAX_VISIBLE_CHIPS = 4

const BLOCK_RE =
  /<<<INDOBASE_(FOLLOWUPS|CHOICES)\s*\r?\n([\s\S]*?)\r?\nINDOBASE_(FOLLOWUPS|CHOICES)>>>\s*/gi

export const DEFAULT_POST_BUILD_TITLE = 'Where should I take this next?'

/**
 * Example catalog for agent instructions / seeds only — NOT injected by the UI.
 * Prefer personalized, goal-tied chips from the agent.
 */
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

/** Example CHOICES for agent instructions — not UI-injected. */
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
      'I will paste my Razorpay or Stripe API keys — call connectGateway (POST /api/os/tools/connectGateway) with settlement_market and the keys so Indobase validates and stores them for direct checkout',
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
    label: 'Refine the design',
    message: 'Refine the design and branding — polish layout, typography, and visuals',
  },
  {
    label: 'Leave it as-is for now',
    message: 'Looks good — leave it as-is for now',
  },
] as const

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

/**
 * Extract the first FOLLOWUPS/CHOICES block. Returns null if none.
 */
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

/** Body mentions a real preview / live site (not merely “what’s next”). */
export function bodyHasDeliverableSignal(message: string): boolean {
  const text = message.toLowerCase()
  return /sites\.indobase\.in|live preview|is now live|here's what i built|here is what i built|go live — published|published to|preview is ready|preview ready/.test(
    text,
  )
}

/** Heuristic: finished build / preview / launch summary (tests / docs). */
export function looksLikeCompletedDeliverable(message: string): boolean {
  const text = message.toLowerCase()
  if (parseFollowUps(message)) return false
  if (looksLikePreBuildClarification(message)) return false
  if (bodyHasDeliverableSignal(message)) return true
  if (
    /where do you want to take|what('s| is) next|take it from here/.test(text) &&
    bodyHasDeliverableSignal(message)
  ) {
    return true
  }
  return false
}

/** Guest gate / account / "before I begin" — not a finished website. */
export function looksLikePreBuildClarification(message: string): boolean {
  const text = message.toLowerCase()
  return (
    /clarifying guest|guest (account )?gate|before i begin|please share:|dpdp consent|name \+ email|name and email|privacy policy|terms of (use|service)|verification otp|authstart|authverify|collect.*(name|email|consent)|fill in:/.test(
      text,
    ) ||
    (/guest/.test(text) && /name|email|consent/.test(text) && /before|first|gate|share/.test(text))
  )
}

/** Default post-build wall (Go Live / payments / checklist…) — not for pre-build chat. */
export function itemsLookLikeDefaultPostBuild(items: readonly FollowUpItem[]): boolean {
  if (items.length < 3) return false
  const blob = items.map((i) => `${i.label} ${i.message}`.toLowerCase()).join('\n')
  const markers = ['go live', 'add payments', 'production checklist', 'connect my domain', 'add customer login']
  const hits = markers.filter((m) => blob.includes(m)).length
  return hits >= 2
}

/** Payments market / KYC / checkout path (capability stage). */
export function looksLikePaymentsPath(message: string): boolean {
  const text = message.toLowerCase()
  return /where will customers pay|finish payments|payments are live|settlement_market|connectgateway|wirecheckout|paste (api )?keys|merchant kyc|razorpay|stripe|india \(razorpay\)|international \(stripe\)/.test(
    text,
  )
}

/**
 * Infer chip timing stage from the agent message body (after FOLLOWUPS strip).
 * Deterministic rules only — content still comes from the agent.
 */
export function inferChipStage(body: string): ChipStage {
  if (looksLikePreBuildClarification(body)) return 'guest_gate'
  if (bodyHasDeliverableSignal(body)) return 'deliverable'
  if (looksLikePaymentsPath(body)) return 'payments'
  return 'building'
}

function capChips(parsed: ParsedFollowUps): ParsedFollowUps {
  if (parsed.items.length <= MAX_VISIBLE_CHIPS) return parsed
  return { ...parsed, items: parsed.items.slice(0, MAX_VISIBLE_CHIPS) }
}

/**
 * Enforce Naive-style timing + brevity on agent-authored chips.
 * Never invents chips — only strips / trims.
 */
export function applyStageGate(parsed: ParsedFollowUps, stage: ChipStage = inferChipStage(parsed.body)): ParsedFollowUps {
  if (stage === 'guest_gate') {
    return { body: parsed.body, title: '', items: [] }
  }

  if (stage === 'building') {
    // Mid-build: allow goal-tied CHOICES; strip canned post-build catalogs.
    if (itemsLookLikeDefaultPostBuild(parsed.items)) {
      return { body: parsed.body, title: '', items: [] }
    }
    return capChips(parsed)
  }

  // payments | deliverable — show agent chips, cap at 4
  return capChips(parsed)
}

/**
 * Resolve chips for display.
 *
 * Agent-authored only: parse FOLLOWUPS/CHOICES from the message.
 * Stage gate enforces timing; never invents catalogs.
 */
export function resolveFollowUps(message: string): ParsedFollowUps | null {
  const parsed = parseFollowUps(message)
  if (!parsed) return null
  return applyStageGate(parsed)
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
