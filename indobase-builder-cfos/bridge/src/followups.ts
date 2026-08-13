/**
 * Parse Indobase follow-up / choice chips from agent message text.
 *
 * Product policy (goal → gate → build → cards):
 *   North star: take the operator to a **full launch** via recommendation chips
 *   (preview → Go Live → payments/domain/checklist) — never stall after 1–2 rounds
 *   and never restart guest/auth once signed in.
 *   1. Clear build ask → ack (+ guest gate if unsigned-in)
 *   2. Guest gate → name/email/DPDP/OTP; niche CHOICES OK (store asks)
 *   3. Building → at most goal-tied CHOICES; keep ≤3 personalized launch-ladder chips
 *   4. Deliverable / stage done → agent FOLLOWUPS (or inject next ladder stage)
 *   5. Capability path → agent-authored CHOICES for that path
 *
 * Cards prefer agent-authored <<<INDOBASE_FOLLOWUPS>>> / CHOICES.
 * If the agent omits chips after a completed deliverable, resolveFollowUps
 * injects Naive-style postPreview / postBackend / postGoLive chips (≤3).
 * Niche prose without a CHOICES block is injected as ecommerce niche chips.
 *
 * Timing is enforced by a thin deterministic stage gate (Naive-style):
 * guest_gate → niche CHOICES only | building → keep ≤3 ladder chips (strip long walls) |
 * payments / deliverable → show chips, max 3.
 */

export type FollowUpItem = {
  label: string
  message: string
}

/** Session journey primary CTA — aligned with launch-journey.ts next_action. */
export type JourneyNextAction = {
  label: string
  message: string
}

export type JourneyChipFlags = {
  isGuest?: boolean
  isLive?: boolean
  isBackendReady?: boolean
  isPaymentsReady?: boolean
  liveUrl?: string | null
}

export type ResolveFollowUpsOptions = {
  journeyNextAction?: JourneyNextAction | null
  journeyHeadline?: string | null
  /** @deprecated prefer journeyFlags.isLive */
  journeyIsLive?: boolean
  journeyLiveUrl?: string | null
  journeyFlags?: JourneyChipFlags | null
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
export const MAX_VISIBLE_CHIPS = 3

export const DEFAULT_POST_BUILD_TITLE = 'Where should I take this next?'

/**
 * Example catalog for agent instructions / seeds only — NOT injected by the UI.
 * Prefer personalized, goal-tied chips from the agent.
 */
export const DEFAULT_POST_BUILD_FOLLOWUPS: readonly FollowUpItem[] = [
  {
    label: 'Launch store',
    message: 'Launch my store on Indobase now.',
  },
  {
    label: 'Connect my domain',
    message:
      'Connect a domain I already own — launchBusiness with customDomain; CNAME @ or www → sites.indobase.in (DNS at my registrar; Indobase does not auto-verify yet)',
  },
  {
    label: 'Add customer login',
    message: 'Call ensureLogin and wire a Sign-in CTA for this app',
  },
  {
    label: 'Add a real backend',
    message:
      'Call guidedBackend (or ensureDatabase then applySchema / setupShopCatalog) BEFORE more UI — then wire screens to session.backend / project REST',
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
    label: 'Refine then Go Live',
    message: 'Refine the design briefly, then Go Live with launchBusiness — full launch is the goal',
  },
] as const

/** Example CHOICES for agent instructions — not UI-injected. */
export const APP_TYPE_TITLE = 'What kind of web app is this?'

export const APP_TYPE_FOLLOWUPS: readonly FollowUpItem[] = [
  {
    label: 'Landing / marketing site',
    message:
      'This is a landing/marketing site — POST /api/os/apps/launch { appType: "landing", production: true }. The job deploys; do not call launchBusiness yourself.',
  },
  {
    label: 'SaaS / web app',
    message:
      'This is a SaaS web app — POST /api/os/apps/launch { appType: "saas", production: true }. The job provisions auth+database, generates a wired UI, verifies, and deploys. Do not call ensure* yourself.',
  },
  {
    label: 'Ecommerce / store',
    message:
      'This is an ecommerce store — POST /api/os/apps/launch { appType: "ecommerce", production: true, vertical if known }. The job provisions catalog + commerce ABI and deploys. Do not call guidedBackend yourself.',
  },
  {
    label: 'Booking / appointments',
    message:
      'This is a booking app — ensureLogin + applySchema for resources/slots/bookings FIRST, then UI, then Go Live; productionChecklist app_type booking',
  },
  {
    label: 'Blog / content',
    message:
      'This is a blog/content site — ensureDatabase + applySchema for posts FIRST, then UI + SEO, then Go Live; productionChecklist app_type blog',
  },
  {
    label: 'Dashboard / internal tool',
    message:
      'This is a dashboard/internal tool — ensureLogin + applySchema FIRST, then UI, then Go Live; productionChecklist app_type dashboard',
  },
  {
    label: "I'll describe it",
    message: "I'll describe the web app so you can pick the right production path",
  },
] as const

export const ECOMMERCE_NICHE_TITLE = 'What will your store sell?'

export const AUTO_CHAIN_STORE_TITLE = 'Launch your store — pick a niche'

/**
 * Vertical ids/labels aligned with vertical-catalog.ts ECOMMERCE_VERTICALS (first 4 for chip budget).
 * Kept inline so FE branding copy stays free of vertical-catalog imports.
 */
export const ECOMMERCE_AUTO_CHAIN_VERTICALS = [
  { id: 'apparel', label: 'Apparel / fashion' },
  { id: 'electronics', label: 'Electronics' },
  { id: 'food-grocery', label: 'Food & grocery' },
  { id: 'beauty', label: 'Beauty' },
] as const

/**
 * Clear landing/marketing ask (not store/SaaS) — single-turn build + launchBusiness; skip PB ecommerce.
 */
export function looksLikeClearLandingAsk(message: string): boolean {
  const text = message.toLowerCase()
  if (
    /\b(store|shop|ecommerce|e-?commerce|inventory|product catalog|online store|webshop|sell products|checkout|guidedbackend|place_test_order)\b/.test(
      text,
    )
  ) {
    return false
  }
  if (/\b(saas|dashboard|booking app|client portal|with login|user accounts)\b/.test(text)) return false
  return (
    /\b(landing\s*(page|site)|marketing\s*(site|page|landing)|brochure(\s*site)?|coming\s*soon\s*page)\b/.test(
      text,
    ) ||
    /\b(website|site|page) for (my |our |a )[\w][\w\s'-]{1,40}/.test(text) ||
    /\b(build|make|create|design) (me )?(a |my |our )?(simple )?(landing|marketing|brochure)\b/.test(text)
  )
}

/**
 * Landing single-turn Go Live — clear landing ask; agent must call launchBusiness in the same turn
 * (no continue / take-live micro-prompts; no guidedBackend).
 */
export function looksLikeLandingSingleTurnIntent(message: string): boolean {
  return looksLikeClearLandingAsk(message)
}

/**
 * Clear backend/live store intent — skip preview-only niche ladder; auto-chain guidedBackend.
 * Used by chip injection and agent policy seeds. Does NOT fire for clear landing/marketing asks.
 */
export function looksLikeAutoChainIntent(message: string): boolean {
  const text = message.toLowerCase()
  if (/do not call guidedbackend|preview only|localstorage cart only|niche only/.test(text)) return false
  if (looksLikeClearLandingAsk(message)) return false
  return (
    /\b(launch (a |my )?(store|shop|business|ecommerce)|take (it )?live|go live now|publish (my |the )?(store|shop|site|business))\b/.test(
      text,
    ) ||
    /\b(add (a )?real backend|real backend|create admin|shop admin|admin dashboard|wire (the )?backend|full backend)\b/.test(
      text,
    ) ||
    /\bguidedbackend\b/.test(text) ||
    /\b(launch with backend|store with (real )?inventory|live catalog|place_test_order)\b/.test(text)
  )
}

/** Auto-chain niche CHOICES — each chip invokes guidedBackend + placeTestShopOrder (not preview-only). */
export function autoChainStoreFollowups(brand?: string | null): StageFollowUps {
  const name = brandLabel(brand)
  const brandArg = name !== 'this' ? ` brand=${name}` : ''
  return {
    title: name !== 'this' ? `Launch ${name} — full backend path` : AUTO_CHAIN_STORE_TITLE,
    items: ECOMMERCE_AUTO_CHAIN_VERTICALS.map((v) => ({
      label: v.label,
      message: `Launch ${v.label} store — INDOBASE_GUIDED_BACKEND mode=ecommerce vertical=${v.id}${brandArg} place_test_order=true — seed catalog, prove with placeTestShopOrder, publish storefront_html (Commerce ABI), then emit Go Live chips`,
    })),
  }
}

/** Landing single-turn chips — Go Live with launchBusiness; skip PocketBase ecommerce. */
export function landingSingleTurnFollowups(brand?: string | null): StageFollowUps {
  const name = brandLabel(brand)
  return {
    title: whereNextTitle(brand),
    items: [
      {
        label: 'Go Live on Indobase',
        message: `Go Live now — POST /api/os/apps/launch { appType: "landing", production: true } for ${name} (skip guidedBackend / PocketBase ecommerce). Quote the job live URL when status=live, then emit Domain / Checklist chips — no continue/take-live micro-prompts`,
      },
      {
        label: 'Connect my domain',
        message: `Connect a domain I already own for ${name} — launchBusiness with customDomain; return CNAME name=@ or www → sites.indobase.in. DNS must propagate at my registrar; Indobase does not auto-verify DNS yet`,
      },
      {
        label: 'Production checklist',
        message: `Run productionChecklist app_type=landing for ${name} with the live_url and honest checks — claim ready only if claim_production_ready is true`,
      },
    ],
  }
}

/** Chips after auto-chain intent when backend is not yet ready — full chain, not preview. */
export function autoChainBackendFollowups(brand?: string | null): StageFollowUps {
  const name = brandLabel(brand)
  return {
    title: whereNextTitle(brand),
    items: [
      {
        label: 'Launch with real backend',
        message: `Call guidedBackend mode=ecommerce for ${name} with place_test_order=true — seed catalog, prove order, publish storefront_html (Commerce ABI), then emit Go Live chips`,
      },
      {
        label: 'Go Live on Indobase',
        message: `Go Live — call launchProductionApp for ${name} (POST /api/os/apps/launch production:true); quote LIVE url only when status=live, then Domain / Add payments / Checklist chips`,
      },
      {
        label: 'Create admin dashboard',
        message: `Call guidedBackend mode=ecommerce for ${name} with place_test_order=true, publish admin_html via launchBusiness as admin.html once, then Go Live if storefront not live`,
      },
      {
        label: 'Wire then Go Live',
        message: `Publish ${name} storefront_html (window.indobase.commerce) then Go Live with launchBusiness in one pass`,
      },
    ],
  }
}

/** Self-contained niche CHOICES for FE (no vertical-catalog import). Preview-only; labels match ECOMMERCE_VERTICALS. */
export const ECOMMERCE_NICHE_FOLLOWUPS: readonly FollowUpItem[] = [
  ...ECOMMERCE_AUTO_CHAIN_VERTICALS.map((v) => ({
    label: v.label,
    message:
      `Niche ${v.label} — invent brand + aesthetic, build a preview storefront with localStorage cart (vertical=${v.id}). ` +
      `Do NOT call guidedBackend yet. After preview, emit Go Live–first FOLLOWUPS and keep advancing the launch ladder until live url + payments path.`,
  })),
  {
    label: "I'll type my specific niche",
    message:
      "I'll type my specific niche — invent brand + build preview storefront with localStorage cart; do NOT call guidedBackend until I pick Add a real backend; after preview keep emitting Go Live–first launch-ladder chips",
  },
]

export function itemsLookLikeEcommerceNiche(items: readonly FollowUpItem[]): boolean {
  if (!items.length) return false
  const blob = items.map((i) => `${i.label} ${i.message}`.toLowerCase()).join('\n')
  return (
    /what will your store sell|vertical=apparel|niche apparel|i'll type my specific niche|localstorage cart|do not call guidedbackend yet/.test(
      blob,
    ) || items.some((i) => /apparel|electronics|handmade|beauty|grocery|niche/i.test(i.label))
  )
}

export function looksLikeEcommerceNicheAsk(message: string): boolean {
  const text = message.toLowerCase()
  return /what will (your|the) store sell|which vertical|apparel \/ fashion|streetwear|women'?s fashion|handmade|pick a (store )?niche|store category|what (kind of|type of) (products|goods)|digital products \(downloads\)|electronics \/ gadgets|home lifestyle/.test(
    text,
  )
}

/** SaaS / booking / dashboard / client-app asks that need ensure-first (not store preview). */
export function looksLikeSaaSOrBackendAppAsk(message: string): boolean {
  const text = message.toLowerCase()
  if (/landing page only|marketing site only|static brochure/.test(text)) return false
  return (
    /\b(saas|web app|client portal|customer portal|dashboard|internal tool|booking app|appointments app)\b/.test(
      text,
    ) ||
    /\b(with login|with auth|user accounts|sign[\s-]?in|customer login|database|real backend|postgres|supabase)\b/.test(
      text,
    ) ||
    /this is a saas|build a saas|saas web app/.test(text)
  )
}

/**
 * Strip leaked model CoT / “Considering…” dumps from assistant text shown in chat.
 */
export function stripLeakedCot(message: string): string {
  if (!message) return message
  let t = message
  t = t.replace(/<think>[\s\S]*?<\/think>/gi, '')
  t = t.replace(/<thought>[\s\S]*?<\/thought>/gi, '')
  // Drop a "Considering…" heading and the following paragraph until a blank line.
  t = t.replace(/(?:^|\n+)#{0,3}\s*Considering[^\n]*\n(?:[^\n]+\n)*?(?=\n\n|$)/gi, '\n\n')
  t = t.replace(/(?:^|\n)Considering guest information[^\n]*\n?/gi, '\n')
  // Drop obvious internal-planning one-liners
  t = t.replace(
    /(?:^|\n)(?:I need to|Let me think|Internal(?:ly)?|My (?:plan|reasoning))\b[^\n]{10,}\n?/gi,
    '\n',
  )
  return t.replace(/\n{3,}/g, '\n\n').trim()
}

/** Hide raw tool capsule dumps from operator-visible markdown (keep dev capsules intact). */
export function stripToolCapsuleNoise(message: string): string {
  if (!message) return message
  let t = message
  t = t.replace(/```(?:json)?\s*\{[\s\S]*?"tool"\s*:\s*"sessionStatus"[\s\S]*?\}\s*```/gi, '')
  t = t.replace(
    /```(?:json)?\s*\{[\s\S]*?"(?:signed_in|stage|guest)"[\s\S]*?"sessionStatus"[\s\S]*?\}\s*```/gi,
    '',
  )
  t = t.replace(/^.*\bListed \d+ blueprints?\b.*$/gim, '')
  t = t.replace(/^.*\bsessionStatus\b.*(?:signed_in|member|guest).*$/gim, '')
  return t.replace(/\n{3,}/g, '\n\n').trim()
}

export function cleanOperatorMessage(message: string): string {
  return stripToolCapsuleNoise(stripLeakedCot(message))
}

function journeyChipTitle(headline?: string | null): string {
  const h = (headline || '').trim()
  return h || DEFAULT_POST_BUILD_TITLE
}

function journeyChipAlreadyPresent(items: readonly FollowUpItem[], nextAction: JourneyNextAction): boolean {
  const label = nextAction.label.toLowerCase()
  const msg = nextAction.message.toLowerCase()
  return items.some(
    (i) =>
      i.label.toLowerCase() === label ||
      i.message.toLowerCase() === msg ||
      (label.includes('go live') && /go live/i.test(i.label)),
  )
}

function isGoLiveChip(item: FollowUpItem): boolean {
  const label = item.label.toLowerCase()
  const msg = item.message.toLowerCase()
  return (
    /\bgo live\b/.test(label) ||
    /\blaunch store\b/.test(label) ||
    (/\blaunchbusiness\b/.test(msg) && /\bgo live\b/.test(msg) && !/\bcustomdomain\b/.test(msg) && !/\badmin\.html\b/.test(msg))
  )
}

function isNicheCategoryChip(item: FollowUpItem): boolean {
  return /^(apparel|electronics|food|beauty|grocery|fashion|i'?ll type)/i.test(item.label.trim())
}

function isPaymentsChip(item: FollowUpItem): boolean {
  const label = item.label.toLowerCase()
  const msg = item.message.toLowerCase()
  return (
    /\badd payments\b/.test(label) ||
    /\bconnect payments\b/.test(label) ||
    /\bindia\b.*\brazorpay\b|\brazorpay\b.*\bindia\b/.test(label) ||
    /\binternational\b.*\bstripe\b|\bstripe\b.*\binternational\b/.test(label) ||
    /\bconnectgateway\b|\bwirecheckout\b|\bpaste api keys\b|\bcomplete kyc\b/.test(label + ' ' + msg) ||
    (/settlement_market/.test(msg) && /\bpayments\b/.test(msg))
  )
}

function isBackendEnsureChip(item: FollowUpItem): boolean {
  const label = item.label.toLowerCase()
  const msg = item.message.toLowerCase()
  return (
    /\badd a real backend\b/.test(label) ||
    /\bconnect products/.test(label) ||
    /\bguidedbackend\b/.test(msg) ||
    /\bpublish commerce storefront\b/.test(label) ||
    (/\bensuredatabase\b/.test(msg) && /\bapplyschema\b/.test(msg))
  )
}

function looksLikeNicheChipSet(parsed: ParsedFollowUps): boolean {
  const title = (parsed.title || '').toLowerCase()
  if (/what will your (online )?shop sell|choose your store category|which niche|pick a niche/.test(title)) {
    return true
  }
  const nicheCount = parsed.items.filter(isNicheCategoryChip).length
  return nicheCount >= 2
}

function looksLikePaymentsChipSet(parsed: ParsedFollowUps): boolean {
  const title = (parsed.title || '').toLowerCase()
  if (/where will customers pay|finish payments|payments are live/.test(title)) return true
  return parsed.items.filter(isPaymentsChip).length >= 2
}

function resolveJourneyFlags(opts?: ResolveFollowUpsOptions | null): JourneyChipFlags {
  if (!opts) return {}
  const f = opts.journeyFlags || {}
  const liveUrl = (f.liveUrl || opts.journeyLiveUrl || null) as string | null
  // Only treat live as authoritative when the caller passed journey live signals.
  // No opts → undefined isLive (prose heuristics / agent chips stay).
  const liveAuthoritative =
    opts.journeyFlags != null ||
    opts.journeyIsLive !== undefined ||
    Boolean(liveUrl && String(liveUrl).trim())
  return {
    isGuest: f.isGuest,
    isLive: liveAuthoritative
      ? Boolean(f.isLive || opts.journeyIsLive || (liveUrl && String(liveUrl).trim()))
      : undefined,
    isBackendReady: f.isBackendReady,
    isPaymentsReady: f.isPaymentsReady,
    liveUrl,
  }
}

/**
 * Platform allowlist: chips must match journey flags, not only agent prose.
 * - isLive === false → no payments market / Add payments
 * - isLive === true → no Go Live / niche
 * - backend ready → no "Add a real backend" / guidedBackend ensure chips
 * - payments ready → no Add payments / KYC / connectGateway chips
 * - isLive undefined → do not apply live/payments stage filters (no journey authority)
 */
export function filterChipsForJourneyState(
  parsed: ParsedFollowUps,
  flags?: JourneyChipFlags | null,
): ParsedFollowUps {
  if (!flags) return parsed
  if (flags.isGuest) {
    return { ...parsed, title: '', items: [] }
  }
  let items = [...parsed.items]
  if (flags.isLive === true) {
    items = items.filter((i) => !isGoLiveChip(i) && !isNicheCategoryChip(i))
  } else if (flags.isLive === false) {
    items = items.filter((i) => !isPaymentsChip(i))
  }
  if (flags.isBackendReady) {
    items = items.filter((i) => !isBackendEnsureChip(i))
  }
  if (flags.isPaymentsReady) {
    items = items.filter((i) => !isPaymentsChip(i))
  }
  return { ...parsed, items: items.slice(0, MAX_VISIBLE_CHIPS) }
}

/** @deprecated use filterChipsForJourneyState */
export function filterChipsForLiveJourney(
  parsed: ParsedFollowUps,
  opts?: { isLive?: boolean },
): ParsedFollowUps {
  return filterChipsForJourneyState(parsed, { isLive: opts?.isLive })
}

function prependJourneyChip(parsed: ParsedFollowUps, nextAction: JourneyNextAction): ParsedFollowUps {
  if (journeyChipAlreadyPresent(parsed.items, nextAction)) return parsed
  return {
    ...parsed,
    items: [nextAction, ...parsed.items].slice(0, MAX_VISIBLE_CHIPS),
  }
}

function applyJourneyChip(
  parsed: ParsedFollowUps,
  nextAction: JourneyNextAction,
  headline?: string | null,
): ParsedFollowUps {
  const withChip = prependJourneyChip(parsed, nextAction)
  const h = (headline || '').trim()
  return h ? { ...withChip, title: h } : withChip
}

/**
 * When the agent omits FOLLOWUPS, inject the session journey next_action as the primary chip.
 */
export function injectJourneyNextActionFollowUps(
  message: string,
  nextAction: JourneyNextAction,
  headline?: string | null,
): ParsedFollowUps | null {
  if (!message?.trim() || !nextAction?.label?.trim() || parseFollowUps(message)) return null
  if (looksLikePreBuildClarification(message)) return null

  const body = cleanOperatorMessage(message).trim()
  if (body.length < 20) return null

  return {
    body,
    title: journeyChipTitle(headline),
    items: [{ label: nextAction.label.trim(), message: nextAction.message.trim() || nextAction.label.trim() }],
  }
}

export function injectNicheChoices(
  message: string,
  opts?: { journeyIsLive?: boolean },
): ParsedFollowUps | null {
  if (!message || parseFollowUps(message)) return null
  // Site already live — niche is early-ladder only; payments/ops chips instead.
  if (opts?.journeyIsLive) return null
  // Never inject niche cards during guest/auth turns.
  if (inferChipStage(message) === 'guest_gate' || looksLikePreBuildClarification(message)) {
    return null
  }
  const lower = message.toLowerCase()
  const nicheAsk = looksLikeEcommerceNicheAsk(message)
  const guestStore =
    /\b(store|shop|ecommerce|e-?commerce|apparel|fashion|product website|online store|webshop)\b/.test(lower) &&
    !/\b(saas|dashboard|booking|blog|landing page only)\b/.test(lower) &&
    /what will your store sell|which niche|pick a niche/i.test(lower)
  if (!nicheAsk && !guestStore) return null
  const brand = extractBrandFromMessage(message)
  if (looksLikeAutoChainIntent(message)) {
    const stage = autoChainStoreFollowups(brand)
    return {
      body: stripLeakedCot(message),
      title: stage.title,
      items: stage.items.slice(0, MAX_VISIBLE_CHIPS),
    }
  }
  return {
    body: stripLeakedCot(message),
    title: ECOMMERCE_NICHE_TITLE,
    items: ECOMMERCE_NICHE_FOLLOWUPS.slice(0, MAX_VISIBLE_CHIPS),
  }
}

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
    label: 'Wire checkout + checklist',
    message:
      'Call wireCheckout then run productionChecklist with checkout_wired true — finish the full launch path',
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
    label: 'Connect my domain',
    message:
      'Connect a domain I already own — launchBusiness with customDomain; CNAME @ or www → sites.indobase.in (DNS at my registrar; no auto-verify yet)',
  },
] as const

export const SHOP_BACKEND_TITLE = 'Shop backend is live — what next?'

export const SHOP_BACKEND_FOLLOWUPS: readonly FollowUpItem[] = [
  {
    label: 'Publish commerce storefront',
    message:
      'Publish storefront_html with window.indobase.commerce — keep Buy CTA via commerce.checkout; then emit Go Live chips',
  },
  {
    label: 'Go Live on Indobase',
    message:
      'Go Live — call launchProductionApp (POST /api/os/apps/launch production:true); quote LIVE url only when status=live, then emit Domain / Add payments / Checklist chips',
  },
  {
    label: 'Publish admin dashboard',
    message:
      'Publish admin_html from listShopOrders via launchBusiness as admin.html once — it live-refreshes from project REST; do not republish just to refresh orders',
  },
  {
    label: 'Wire then Go Live',
    message: 'Publish storefront_html (window.indobase.commerce) then Go Live with launchBusiness — full launch is the goal',
  },
] as const

function brandLabel(brand?: string | null): string {
  const b = (brand || '').trim()
  return b || 'this'
}

function whereNextTitle(brand?: string | null): string {
  const b = (brand || '').trim()
  return b ? `Where should I take ${b} next?` : DEFAULT_POST_BUILD_TITLE
}

export type StageFollowUps = {
  title: string
  items: FollowUpItem[]
}

/**
 * Example chips after a first preview (Naive-style) — agent must rewrite for the brand.
 * Not injected by the UI.
 */
export function postPreviewFollowups(brand?: string | null): StageFollowUps {
  const name = brandLabel(brand)
  return {
    title: whereNextTitle(brand),
    items: [
      {
        label: 'Go Live on Indobase',
        message: `Go Live — publish ${name} to my Indobase subdomain with launchBusiness, quote the exact url, then emit Domain / Add payments / Checklist chips`,
      },
      {
        label: 'Add a real backend',
        message: `Call guidedBackend mode=ecommerce for ${name}, prove with placeTestShopOrder, then emit Wire / Go Live chips — do not restart guest/auth`,
      },
      {
        label: 'Refine then Go Live',
        message: `Refine the design and branding for ${name}, then Go Live with launchBusiness (full launch is the goal)`,
      },
      {
        label: 'Wire + Go Live',
        message: `If catalog exists, publish ${name} storefront_html (Commerce ABI) then Go Live with launchBusiness`,
      },
    ].slice(0, MAX_VISIBLE_CHIPS),
  }
}

/** Ensure-first chips when the operator asked for SaaS/auth/data (not store preview). */
export function postSaasEnsureFirstFollowups(brand?: string | null): StageFollowUps {
  const name = brandLabel(brand)
  return {
    title: whereNextTitle(brand),
    items: [
      {
        label: 'Enable login + database',
        message: `Call guidedBackend mode=generic for ${name} (ensureLogin + ensureDatabase + applySchema) FIRST — then build UI against session.backend`,
      },
      {
        label: 'Wire auth + data UI',
        message: `Wire Sign-in and data screens for ${name} to session.backend api_url + anon_key — no localStorage auth or mock APIs`,
      },
      {
        label: 'Go Live when wired',
        message: `When auth and data are wired, Go Live with launchBusiness app_type=saas and quote the exact url`,
      },
      {
        label: 'Production checklist',
        message: `Run productionChecklist app_type=saas with the live_url and honest checks — only claim production ready if claim_production_ready is true`,
      },
    ].slice(0, MAX_VISIBLE_CHIPS),
  }
}

/**
 * Example chips after guidedBackend / shop catalog is ready — agent must rewrite.
 * Order: wire → Go Live → admin (payments after live).
 */
export function postBackendFollowups(brand?: string | null): StageFollowUps {
  const name = brandLabel(brand)
  return {
    title: whereNextTitle(brand),
    items: [
      {
        label: 'Publish commerce storefront',
        message: `Publish ${name} storefront_html with window.indobase.commerce (product grid + cart + checkout); then emit Go Live chips`,
      },
      {
        label: 'Go Live on Indobase',
        message: `Go Live — publish ${name} with launchBusiness, quote the exact url, then emit Domain / Add payments / Checklist chips`,
      },
      {
        label: 'Publish admin dashboard',
        message: `Publish admin_html for ${name} via launchBusiness as admin.html once (live REST refresh), then continue to Go Live if the storefront is not live yet`,
      },
      {
        label: 'Wire then Go Live',
        message: `Publish ${name} storefront_html then Go Live with launchBusiness in one pass — full launch is the goal`,
      },
    ].slice(0, MAX_VISIBLE_CHIPS),
  }
}

/**
 * Example chips after launchBusiness returned a live url — agent must rewrite.
 * Store path prefers Add payments (India/Razorpay ask) over re-doing backend.
 * When paymentsReady, skip Add payments and prefer checklist / domain.
 * Analytics chips are omitted — Studio Analytics is stripped on CFOS.
 */
export function postGoLiveFollowups(
  brand?: string | null,
  opts?: { store?: boolean; paymentsReady?: boolean },
): StageFollowUps {
  const name = brandLabel(brand)
  const store = opts?.store !== false
  const paymentsReady = Boolean(opts?.paymentsReady)
  if (store && paymentsReady) {
    return postPaymentsFollowups(brand)
  }
  const domainMsg = `Connect a domain I already own for ${name} — launchBusiness with customDomain; return CNAME name=@ or www value=sites.indobase.in. DNS must propagate at my registrar; Indobase does not auto-verify DNS yet — quote tool dns instructions`
  const items: FollowUpItem[] = []
  // Store: payments first (matches journey Payments stage); domain is secondary.
  if (store) {
    items.push({
      label: 'Add payments',
      message: `Connect payments for ${name} — ask India (Razorpay) vs International (Stripe), then connectGateway + wireCheckout (prefer INR for India) and patch Buy CTA`,
    })
  }
  items.push({
    label: 'Connect my domain',
    message: domainMsg,
  })
  if (store) {
    items.push({
      label: 'Production checklist',
      message: `Run productionChecklist for ${name} with the live_url and honest checks — claim ready only if claim_production_ready is true`,
    })
  } else {
    items.push(
      {
        label: 'Add a real backend',
        message: `Call guidedBackend for ${name} if not done — then publish storefront_html (Commerce ABI) and Go Live`,
      },
      {
        label: 'Production checklist',
        message: `Run productionChecklist app_type=landing for ${name} with the live_url and honest checks — claim ready only if claim_production_ready is true`,
      },
    )
  }
  return { title: whereNextTitle(brand), items: items.slice(0, MAX_VISIBLE_CHIPS) }
}

/**
 * Example chips after connectGateway is ready — agent must rewrite.
 */
export function postPaymentsFollowups(brand?: string | null): StageFollowUps {
  const name = brandLabel(brand)
  return {
    title: whereNextTitle(brand),
    items: [
      {
        label: 'Wire checkout into the site',
        message: `Call wireCheckout for ${name} (mode one_time, prefer INR if India) and set Buy CTA href to checkout_url`,
      },
      {
        label: 'Production checklist',
        message: `Run productionChecklist for ${name} with checkout_wired true when CTA uses wireCheckout url — finish full launch`,
      },
      {
        label: 'Publish admin dashboard',
        message: `Publish admin_html for ${name} as admin.html once if not already live`,
      },
      {
        label: 'Connect my domain',
        message: `Connect a domain I already own for ${name} — launchBusiness with customDomain; CNAME @ or www → sites.indobase.in (DNS at my registrar; no auto-verify yet)`,
      },
    ],
  }
}

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
 * Extract FOLLOWUPS/CHOICES chips. If the agent emits multiple blocks, prefer the
 * **last** one (latest stage) and strip all blocks from the markdown body.
 */
export function parseFollowUps(message: string): ParsedFollowUps | null {
  if (!message || !/<<<INDOBASE_(FOLLOWUPS|CHOICES)/i.test(message)) {
    return null
  }

  let title = DEFAULT_POST_BUILD_TITLE
  let items: FollowUpItem[] = []
  let found = false
  // Fresh regex — BLOCK_RE is global; avoid lastIndex bleed across calls.
  const blockRe =
    /<<<INDOBASE_(FOLLOWUPS|CHOICES)\s*\r?\n([\s\S]*?)\r?\nINDOBASE_(FOLLOWUPS|CHOICES)>>>\s*/gi

  const body = message
    .replace(blockRe, (_full, _open, inner: string) => {
      const blockItems: FollowUpItem[] = []
      let blockTitle = DEFAULT_POST_BUILD_TITLE
      for (const rawLine of inner.split(/\r?\n/)) {
        const line = rawLine.trim()
        if (!line) continue
        const titleMatch = /^title\s*:\s*(.+)$/i.exec(line)
        if (titleMatch) {
          blockTitle = titleMatch[1].trim() || blockTitle
          continue
        }
        const item = parseFollowUpLine(line)
        if (item) blockItems.push(item)
      }
      if (blockItems.length > 0) {
        found = true
        title = blockTitle
        items = blockItems
      }
      return ''
    })
    .replace(/\n{3,}/g, '\n\n')
    .trimEnd()

  if (!found || items.length === 0) return null
  return { body, title, items }
}

/** Body mentions a real preview / live site / stage progress (not merely “what’s next”). */
export function bodyHasDeliverableSignal(message: string): boolean {
  const text = message.toLowerCase()
  return /sites\.indobase\.in|live preview|is now live|here's what i built|here is what i built|go live — published|published to|preview is ready|preview ready|what's in it|what is in it|storefront is ready|storefront ready|i built a (full )?(apparel|fashion|ecommerce|store|shop)|claim_backend_ready|catalog seeded|backend ready \(claim|wired (the )?storefront|storefront wired|admin\.html|checkout_url|payments are live|claim_production_ready|refined (the )?(design|hero|branding)|polished (the )?(hero|layout|storefront)|ready when you are|i('ve| have) (updated|refined|polished)|claim_live|published successfully|your (site|store|shop|business) is live|launchbusiness (returned|succeeded|ok)|go live (is )?complete|live at https?:\/\//.test(
    text,
  )
}

/** Published / Go Live complete (even without repeating the hostname). */
export function looksLikeLivePublished(message: string): boolean {
  const text = message.toLowerCase()
  return /sites\.indobase\.in|go live — published|published to|is now live|claim_live|published successfully|your (site|store|shop|business) is live|launchbusiness (returned|succeeded|ok)|go live (is )?complete|live at https?:\/\//.test(
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

  // Explicitly past auth — keep launch chips (checked before authAsk so
  // "past the guest gate" does not re-trigger the gate).
  if (
    /you('re| are) verified|already signed in|signed[- ]in|otp (verified|ok|success)|account (is )?ready|name and email are on file|continue(ing)? (with )?the original|preview ready|here's what i built|sites\.indobase\.in|past the guest( account)? gate|guest checkout/.test(
      text,
    )
  ) {
    return false
  }
  if (bodyHasDeliverableSignal(message)) return false

  // Auth/DPDP ask wins even when the agent also says "I'll build…" (common false-negative).
  const authAsk =
    /clarifying guest|before i (begin|start)|please (share|send):|dpdp consent|privacy policy|terms of (use|service)|verification otp|authstart|authverify|collect.*(name|email|consent)|fill in:/.test(
      text,
    ) ||
    // Require ask/collect context — bare "name and email" mentions must not strip launch chips.
    /(?:please (?:share|send)|need your|ask(?:ing)? for|provide your|send (me )?your).{0,80}(name.{0,40}email|email.{0,40}name|your name)/.test(
      text,
    ) ||
    (/(?:name \+ email|name and email|your name|your email)/.test(text) &&
      /(?:before i (?:begin|start)|please (?:share|send)|dpdp|consent|otp|agree)/.test(text) &&
      !/(?:on file|verified|already signed)/.test(text)) ||
    // Explicit guest-account-gate phrasing — not "guest checkout" / "past the guest gate".
    (/guest (account )?gate/.test(text) &&
      /(?:name|email|consent|otp|dpdp|privacy|terms)/.test(text) &&
      !/(?:checkout|past the guest|already)/.test(text))

  if (authAsk) return true

  return false
}

/** Default post-build wall (Go Live / payments / checklist…) — not for pre-build chat. */
export function itemsLookLikeDefaultPostBuild(items: readonly FollowUpItem[]): boolean {
  if (items.length < 3) return false
  const blob = items.map((i) => `${i.label} ${i.message}`.toLowerCase()).join('\n')
  const markers = ['go live', 'add payments', 'production checklist', 'connect my domain', 'add customer login']
  const hits = markers.filter((m) => blob.includes(m)).length
  return hits >= 2
}

/** Long canned walls only — ≤4 personalized launch-ladder chips must stay visible. */
export function itemsLookLikeCannedPostBuildWall(items: readonly FollowUpItem[]): boolean {
  return itemsLookLikeDefaultPostBuild(items) && items.length > MAX_VISIBLE_CHIPS
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

/** Drop Leave-as-is / skip-for-now dead-ends so the ladder keeps moving to full launch. */
export function stripDeadEndChips(parsed: ParsedFollowUps): ParsedFollowUps {
  const items = parsed.items.filter(
    (i) => !/leave (it )?as-?is|skip (payments|for now)|looks good — leave|leave checkout unfinished/i.test(
      `${i.label} ${i.message}`,
    ),
  )
  if (items.length === parsed.items.length) return parsed
  return { ...parsed, items }
}

/**
 * Enforce Naive-style timing + brevity.
 * Guest/auth turn: strip ALL chips (no niche cards while signing up).
 * Building: strip only long canned walls — keep ≤3 personalized launch-ladder chips
 * so the operator can keep advancing to launch.
 */
export function applyStageGate(parsed: ParsedFollowUps, stage: ChipStage = inferChipStage(parsed.body)): ParsedFollowUps {
  const cleaned = stripDeadEndChips({ ...parsed, body: stripLeakedCot(parsed.body) })

  if (stage === 'guest_gate') {
    // Auth / DPDP / OTP turn — never show recommendation or niche cards.
    return { body: cleaned.body, title: '', items: [] }
  }

  if (stage === 'building') {
    if (itemsLookLikeCannedPostBuildWall(cleaned.items)) {
      return { body: cleaned.body, title: '', items: [] }
    }
    return capChips(cleaned)
  }

  return capChips(cleaned)
}

/** Best-effort brand name from agent prose (for injected chip titles). */
export function extractBrandFromMessage(message: string): string | null {
  const fromUrl = /https?:\/\/([a-z0-9][a-z0-9-]{1,40})\.sites\.indobase\.in/i.exec(message)
  if (fromUrl?.[1] && !/^(www|app|api|admin)$/i.test(fromUrl[1])) {
    const slug = fromUrl[1].replace(/-/g, ' ')
    return slug.replace(/\b\w/g, (c) => c.toUpperCase())
  }
  const fromTitle = /where should i take\s+([A-Z][A-Za-z0-9 &-]{1,40})\s+next/i.exec(message)
  if (fromTitle?.[1]) {
    const brand = fromTitle[1].trim().replace(/\s+/g, ' ')
    if (brand.length >= 2 && !/^(THIS|THE|IT|YOUR)$/i.test(brand)) return brand
  }
  const brandLine =
    /\*\*([A-Z][A-Za-z0-9 &-]{1,40})\*\*/.exec(message) ||
    /["“]([A-Z][A-Za-z0-9 &-]{1,40})["”]/.exec(message) ||
    /(?:brand|named|called)\s*[:—–-]?\s*\*?\*?\s*([A-Z][A-Za-z0-9 &-]{1,40})/i.exec(message) ||
    /\b([A-Z][A-Z0-9]{2,}(?:\s+[A-Z][a-z]+){0,3})\b\s*[—–-]\s*(?:live|modern|a |an )/i.exec(message)
  if (!brandLine?.[1]) return null
  const brand = brandLine[1].trim().replace(/\s+/g, ' ')
  if (brand.length < 2 || /^(HERE|THIS|THE|HTTP|HTTPS|INDOBASE)$/i.test(brand)) return null
  return brand
}

/**
 * When the agent finished a deliverable but omitted FOLLOWUPS, inject Naive-style
 * next-ladder chips so operators keep moving toward full launch.
 *
 * opts.isLive === false → never inject post-live / post-payments (treat false "live" prose as preview).
 * opts.backendReady → prefer Go Live ladder over postBackend / "Add a real backend".
 */
export function injectDeliverableFollowUps(
  message: string,
  opts?: { backendReady?: boolean; isLive?: boolean },
): ParsedFollowUps | null {
  if (!message || parseFollowUps(message)) return null
  // Guest-gate turns may inject niche instead; don't also inject post-preview walls.
  if (looksLikePreBuildClarification(message) && !bodyHasDeliverableSignal(message)) return null
  if (!looksLikeCompletedDeliverable(message) && !bodyHasDeliverableSignal(message)) return null

  const brand = extractBrandFromMessage(message)
  const backendReady = Boolean(opts?.backendReady)
  const forceNotLive = opts?.isLive === false
  let stage: StageFollowUps
  const lower = message.toLowerCase()
  if (
    !forceNotLive &&
    /checkout_url|payments are live|wirecheckout|claim_production_ready/.test(lower)
  ) {
    stage = postPaymentsFollowups(brand)
  } else if (!forceNotLive && looksLikeLivePublished(message)) {
    const landing = looksLikeClearLandingAsk(message)
    stage = postGoLiveFollowups(brand, { store: !landing })
  } else if (
    /claim_backend_ready|catalog seeded|place.?test.?shop.?order|shop backend is live|wired (the )?storefront|storefront wired/.test(
      lower,
    )
  ) {
    // Backend already ready → Go Live ladder (not another ensure-backend wall).
    stage = backendReady ? postPreviewFollowups(brand) : postBackendFollowups(brand)
    if (backendReady) {
      stage = {
        ...stage,
        items: stage.items.filter((i) => !isBackendEnsureChip(i)).slice(0, MAX_VISIBLE_CHIPS),
      }
    }
  } else if (
    looksLikeSaaSOrBackendAppAsk(message) &&
    !/claim_backend_ready|session\.backend|guidedbackend|ensurelogin/.test(lower)
  ) {
    stage = backendReady ? postPreviewFollowups(brand) : postSaasEnsureFirstFollowups(brand)
    if (backendReady) {
      stage = {
        ...stage,
        items: stage.items.filter((i) => !isBackendEnsureChip(i)).slice(0, MAX_VISIBLE_CHIPS),
      }
    }
  } else if (looksLikeLandingSingleTurnIntent(message)) {
    stage = landingSingleTurnFollowups(brand)
  } else if (looksLikeAutoChainIntent(message) && !/claim_backend_ready|catalog seeded|place.?test.?shop.?order/.test(lower)) {
    stage = backendReady ? postPreviewFollowups(brand) : autoChainBackendFollowups(brand)
    if (backendReady) {
      stage = {
        ...stage,
        items: stage.items.filter((i) => !isBackendEnsureChip(i)).slice(0, MAX_VISIBLE_CHIPS),
      }
    }
  } else {
    stage = postPreviewFollowups(brand)
    if (backendReady) {
      stage = {
        ...stage,
        items: stage.items.filter((i) => !isBackendEnsureChip(i)).slice(0, MAX_VISIBLE_CHIPS),
      }
    }
  }
  return {
    body: stripLeakedCot(message),
    title: stage.title,
    items: stage.items.slice(0, MAX_VISIBLE_CHIPS),
  }
}

/** Generic next-step chips when the agent omitted FOLLOWUPS on a substantive reply. */
export function injectAssistantTurnFollowUps(message: string): ParsedFollowUps | null {
  if (!message?.trim() || parseFollowUps(message)) return null
  if (looksLikePreBuildClarification(message)) return null

  const body = stripLeakedCot(message).trim()
  if (body.length < 60) return null

  const deliverable = injectDeliverableFollowUps(message)
  if (deliverable) return deliverable

  const stage = inferChipStage(body)
  if (stage === 'guest_gate' || stage === 'payments') return null

  const brand = extractBrandFromMessage(body)
  if (stage === 'deliverable') {
    return postPreviewFollowups(brand)
  }

  return {
    body,
    title: brand ? `Where should I take ${brand} next?` : DEFAULT_POST_BUILD_TITLE,
    items: [
      {
        label: 'Go Live on Indobase',
        message:
          'Go Live — publish this business with launchBusiness using the real html/files, quote the exact live url, then emit Domain / Add payments / Production checklist chips.',
      },
      {
        label: 'Keep building',
        message: 'Continue implementing the next important screen or feature for this app',
      },
      {
        label: 'Refine the design',
        message: 'Refine spacing, typography, colors, and mobile layout',
      },
      {
        label: 'Add a real backend',
        message:
          'Call guidedBackend (or ensureDatabase + applySchema) and wire screens to session.backend',
      },
    ].slice(0, MAX_VISIBLE_CHIPS),
  }
}

/**
 * Resolve chips for display.
 *
 * Prefer agent-authored FOLLOWUPS/CHOICES. Inject niche CHOICES when the agent
 * asks niche/guest-store in prose without a block. Inject post-deliverable chips
 * when the agent omits FOLLOWUPS after a completed build.
 * When session journey.next_action is present and the agent omitted FOLLOWUPS,
 * prepend or inject that chip so UI matches launch-journey.ts.
 */
export function resolveFollowUps(message: string, opts?: ResolveFollowUpsOptions): ParsedFollowUps | null {
  const cleaned = cleanOperatorMessage(message)
  const flags = resolveJourneyFlags(opts)
  const isLive = flags.isLive === true
  const notLive = flags.isLive === false
  const journeyNext = opts?.journeyNextAction?.label?.trim()
    ? {
        label: opts.journeyNextAction.label.trim(),
        message: (opts.journeyNextAction.message || opts.journeyNextAction.label).trim(),
      }
    : null

  const finish = (parsed: ParsedFollowUps | null): ParsedFollowUps | null => {
    if (!parsed) return null
    return filterChipsForJourneyState(parsed, flags)
  }

  const parsed = parseFollowUps(cleaned)
  if (parsed) {
    const gated = applyStageGate(parsed)
    // Agent-authored niche while live → replace with post-live ladder (not merge with journey).
    if (isLive && looksLikeNicheChipSet(gated)) {
      // fall through to isLive post-live injection
    } else if (notLive && looksLikePaymentsChipSet(gated)) {
      // Strip payments CHOICES before publish; keep remaining non-payment chips if any.
      const finished = finish(
        journeyNext ? applyStageGate(applyJourneyChip(gated, journeyNext, opts?.journeyHeadline)) : gated,
      )
      if (finished && finished.items.length > 0) return finished
      // else fall through to deliverable / journey injection
    } else {
      return finish(
        journeyNext ? applyStageGate(applyJourneyChip(gated, journeyNext, opts?.journeyHeadline)) : gated,
      )
    }
  }

  const niche = injectNicheChoices(cleaned, { journeyIsLive: isLive })
  if (niche) {
    const gated = applyStageGate(niche, inferChipStage(niche.body) === 'guest_gate' ? 'guest_gate' : 'building')
    return finish(
      journeyNext ? applyStageGate(applyJourneyChip(gated, journeyNext, opts?.journeyHeadline)) : gated,
    )
  }

  // Already live (journey authority) + agent asked niche (or omitted FOLLOWUPS): post-live ladder.
  if (isLive) {
    const brand = extractBrandFromMessage(cleaned)
    const postLive = postGoLiveFollowups(brand, {
      store: true,
      paymentsReady: flags.isPaymentsReady,
    })
    const injected: ParsedFollowUps = {
      body: stripLeakedCot(cleaned),
      title: opts?.journeyHeadline?.trim() || postLive.title,
      items: postLive.items.slice(0, MAX_VISIBLE_CHIPS),
    }
    const withJourney = journeyNext
      ? applyJourneyChip(injected, journeyNext, opts?.journeyHeadline)
      : injected
    return finish(applyStageGate(withJourney, flags.isPaymentsReady ? 'deliverable' : 'payments'))
  }

  // Prefer deliverable / journey / keep-building.
  // When journey explicitly says !live, never inject post-live/payments from false "live" prose.
  const injected = injectDeliverableFollowUps(cleaned, {
    backendReady: flags.isBackendReady,
    isLive: notLive ? false : undefined,
  })
  if (injected) {
    const withJourney = journeyNext
      ? applyJourneyChip(injected, journeyNext, opts?.journeyHeadline)
      : injected
    return finish(applyStageGate(withJourney, 'deliverable'))
  }

  const generic = injectAssistantTurnFollowUps(cleaned)
  if (generic) {
    const withJourney = journeyNext
      ? applyJourneyChip(generic, journeyNext, opts?.journeyHeadline)
      : generic
    return finish(applyStageGate(withJourney))
  }

  if (journeyNext) {
    const journeyOnly = injectJourneyNextActionFollowUps(cleaned, journeyNext, opts?.journeyHeadline)
    if (journeyOnly) return finish(applyStageGate(journeyOnly))
  }

  return null
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
