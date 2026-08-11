/**
 * Parse Indobase follow-up / choice chips from agent message text.
 *
 * Product policy (goal → gate → build → cards):
 *   North star: take the operator to a **full launch** via recommendation chips
 *   (preview → Go Live → payments/domain/checklist) — never stall after 1–2 rounds
 *   and never restart guest/auth once signed in.
 *   1. Clear build ask → ack (+ guest gate if unsigned-in)
 *   2. Guest gate → name/email/DPDP/OTP; niche CHOICES OK (store asks)
 *   3. Building → at most goal-tied CHOICES; keep ≤4 personalized launch-ladder chips
 *   4. Deliverable / stage done → agent FOLLOWUPS (or inject next ladder stage)
 *   5. Capability path → agent-authored CHOICES for that path
 *
 * Cards prefer agent-authored <<<INDOBASE_FOLLOWUPS>>> / CHOICES.
 * If the agent omits chips after a completed deliverable, resolveFollowUps
 * injects Naive-style postPreview / postBackend / postGoLive chips (≤4).
 * Niche prose without a CHOICES block is injected as ecommerce niche chips.
 *
 * Timing is enforced by a thin deterministic stage gate (Naive-style):
 * guest_gate → niche CHOICES only | building → keep ≤4 ladder chips (strip long walls) |
 * payments / deliverable → show chips, max 4.
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
      'This is a landing/marketing site — build UI → launchBusiness; SEO + legal; optional domain; productionChecklist app_type landing',
  },
  {
    label: 'SaaS / web app',
    message:
      'This is a SaaS web app — ensureLogin + ensureDatabase + applySchema FIRST, then build UI against session.backend, then Go Live; productionChecklist app_type saas',
  },
  {
    label: 'Ecommerce / store',
    message:
      'This is an ecommerce store — niche CHOICES if needed, preview storefront first (localStorage cart); guidedBackend only on Add a real backend, then Wire → Go Live → payments when asked; productionChecklist app_type ecommerce',
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

/** Self-contained niche CHOICES for FE (no vertical-catalog import). Preview-only messages. */
export const ECOMMERCE_NICHE_FOLLOWUPS: readonly FollowUpItem[] = [
  {
    label: 'Apparel / fashion',
    message:
      'Niche Apparel / fashion — invent brand + aesthetic, build a preview storefront with localStorage cart (vertical=apparel). Do NOT call guidedBackend yet. After preview, emit launch-ladder FOLLOWUPS (Go Live first) and keep advancing until live url + payments path.',
  },
  {
    label: 'Electronics / gadgets',
    message:
      'Niche Electronics / gadgets — invent brand + aesthetic, build a preview storefront with localStorage cart (vertical=electronics). Do NOT call guidedBackend yet. After preview, emit Go Live–first FOLLOWUPS and continue the launch ladder.',
  },
  {
    label: 'Food / grocery',
    message:
      'Niche Food / grocery — invent brand + aesthetic, build a preview storefront with localStorage cart (vertical=food-grocery). Do NOT call guidedBackend yet. After preview, emit Go Live–first FOLLOWUPS and continue the launch ladder.',
  },
  {
    label: 'Beauty / personal care',
    message:
      'Niche Beauty / personal care — invent brand + aesthetic, build a preview storefront with localStorage cart (vertical=beauty). Do NOT call guidedBackend yet. After preview, emit Go Live–first FOLLOWUPS and continue the launch ladder.',
  },
  {
    label: "I'll type my specific niche",
    message:
      "I'll type my specific niche — invent brand + build preview storefront with localStorage cart; do NOT call guidedBackend until I pick Add a real backend; after preview keep emitting Go Live–first launch-ladder chips",
  },
] as const

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

/**
 * Strip leaked model CoT / “Considering…” dumps from assistant text shown in chat.
 */
export function stripLeakedCot(message: string): string {
  if (!message) return message
  let t = message
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

export function injectNicheChoices(message: string): ParsedFollowUps | null {
  if (!message || parseFollowUps(message)) return null
  const lower = message.toLowerCase()
  const nicheAsk = looksLikeEcommerceNicheAsk(message)
  // Guest store asks only — avoid false positives on generic “sell” / marketing copy.
  const guestStore =
    looksLikePreBuildClarification(message) &&
    /\b(store|shop|ecommerce|e-?commerce|apparel|fashion|product website|online store|webshop)\b/.test(lower) &&
    !/\b(saas|dashboard|booking|blog|landing page only)\b/.test(lower)
  if (!nicheAsk && !guestStore) return null
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
    message: 'Connect a domain I already own — customDomain + CNAME to sites.indobase.in',
  },
] as const

export const SHOP_BACKEND_TITLE = 'Shop backend is live — what next?'

export const SHOP_BACKEND_FOLLOWUPS: readonly FollowUpItem[] = [
  {
    label: 'Wire storefront to this catalog',
    message:
      'Wire the storefront product grid to catalog_json / session.backend REST — keep Buy CTA placeholder until payments are connected; then emit Go Live chips',
  },
  {
    label: 'Go Live on Indobase',
    message:
      'Go Live — publish this store with launchBusiness, quote the exact url, then emit Domain / Add payments / Checklist chips',
  },
  {
    label: 'Publish admin dashboard',
    message:
      'Publish admin_html from listShopOrders via launchBusiness as admin.html once — it live-refreshes from project REST; do not republish just to refresh orders',
  },
  {
    label: 'Wire then Go Live',
    message: 'Wire the storefront to session.backend then Go Live with launchBusiness — full launch is the goal',
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
        message: `If catalog exists, wire the ${name} storefront to session.backend then Go Live with launchBusiness`,
      },
    ],
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
        label: 'Wire storefront to this catalog',
        message: `Wire the ${name} storefront to catalog_json / session.backend REST (product grid + cart); Buy CTA placeholder until payments; then emit Go Live chips`,
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
        message: `Wire ${name} to session.backend then Go Live with launchBusiness in one pass — full launch is the goal`,
      },
    ],
  }
}

/**
 * Example chips after launchBusiness returned a live url — agent must rewrite.
 * Store path prefers Add payments (India/Razorpay ask) over re-doing backend.
 */
export function postGoLiveFollowups(brand?: string | null, opts?: { store?: boolean }): StageFollowUps {
  const name = brandLabel(brand)
  const store = opts?.store !== false
  const items: FollowUpItem[] = [
    {
      label: 'Connect my domain',
      message: `Connect a domain I already own for ${name} — customDomain + CNAME to sites.indobase.in`,
    },
    {
      label: 'Add payments',
      message: store
        ? `Connect payments for ${name} — ask India (Razorpay) vs International (Stripe), then connectGateway + wireCheckout (prefer INR for India) and patch Buy CTA`
        : `Connect payments for ${name} — India vs International, connectGateway, wireCheckout`,
    },
    {
      label: 'Production checklist',
      message: `Run productionChecklist for ${name} with the live_url and honest checks — claim ready only if claim_production_ready is true`,
    },
    {
      label: 'Refine the design',
      message: `Refine the design and branding for ${name}`,
    },
  ]
  if (!store) {
    items.splice(1, 0, {
      label: 'Add a real backend',
      message: `Call guidedBackend for ${name} if not done — then wire the live site to session.backend`,
    })
    items.pop()
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
        message: `Connect a domain I already own for ${name} — customDomain + CNAME to sites.indobase.in`,
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
  // Past the gate / already building — never reclassify as guest_gate (keeps launch chips).
  if (
    /you('re| are) verified|already signed in|signed[- ]in|otp (verified|ok|success)|account (is )?ready|name and email are on file|on file|continue(ing)? (with )?the original|building the|i('ll| will) (now )?(build|continue)|preview ready|here's what i built|sites\.indobase\.in/.test(
      text,
    )
  ) {
    return false
  }
  if (bodyHasDeliverableSignal(message)) return false

  return (
    /clarifying guest|guest (account )?gate|before i begin|please share:|dpdp consent|privacy policy|terms of (use|service)|verification otp|authstart|authverify|collect.*(name|email|consent)|fill in:/.test(
      text,
    ) ||
    // Require ask/collect context — bare "name and email" mentions must not strip launch chips.
    /(?:please share|need your|ask(?:ing)? for|provide your|send (me )?your).{0,60}(name.{0,24}email|email.{0,24}name)/.test(
      text,
    ) ||
    (/(?:name \+ email|name and email)/.test(text) &&
      /(?:before i begin|please share|dpdp|consent|otp|guest)/.test(text) &&
      !/(?:on file|verified|signed)/.test(text)) ||
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
 * Guest gate: strip post-build walls, but KEEP ecommerce niche CHOICES.
 * Building: strip only long canned walls — keep ≤4 personalized launch-ladder chips
 * so the operator can keep advancing to full Go Live.
 */
export function applyStageGate(parsed: ParsedFollowUps, stage: ChipStage = inferChipStage(parsed.body)): ParsedFollowUps {
  const cleaned = stripDeadEndChips({ ...parsed, body: stripLeakedCot(parsed.body) })

  if (stage === 'guest_gate') {
    if (itemsLookLikeEcommerceNiche(cleaned.items) || /^what will your store sell/i.test(cleaned.title)) {
      return capChips(cleaned)
    }
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
 */
export function injectDeliverableFollowUps(message: string): ParsedFollowUps | null {
  if (!message || parseFollowUps(message)) return null
  // Guest-gate turns may inject niche instead; don't also inject post-preview walls.
  if (looksLikePreBuildClarification(message) && !bodyHasDeliverableSignal(message)) return null
  if (!looksLikeCompletedDeliverable(message) && !bodyHasDeliverableSignal(message)) return null

  const brand = extractBrandFromMessage(message)
  let stage: StageFollowUps
  const lower = message.toLowerCase()
  if (/checkout_url|payments are live|wirecheckout|claim_production_ready/.test(lower)) {
    stage = postPaymentsFollowups(brand)
  } else if (looksLikeLivePublished(message)) {
    stage = postGoLiveFollowups(brand, { store: true })
  } else if (
    /claim_backend_ready|catalog seeded|place.?test.?shop.?order|shop backend is live|wired (the )?storefront|storefront wired/.test(
      lower,
    )
  ) {
    stage = postBackendFollowups(brand)
  } else {
    stage = postPreviewFollowups(brand)
  }
  return {
    body: stripLeakedCot(message),
    title: stage.title,
    items: stage.items.slice(0, MAX_VISIBLE_CHIPS),
  }
}

/**
 * Resolve chips for display.
 *
 * Prefer agent-authored FOLLOWUPS/CHOICES. Inject niche CHOICES when the agent
 * asks niche/guest-store in prose without a block. Inject post-deliverable chips
 * when the agent omits FOLLOWUPS after a completed build.
 */
export function resolveFollowUps(message: string): ParsedFollowUps | null {
  const cleaned = stripLeakedCot(message)
  const parsed = parseFollowUps(cleaned)
  if (parsed) return applyStageGate(parsed)

  const niche = injectNicheChoices(cleaned)
  if (niche) return applyStageGate(niche, inferChipStage(niche.body) === 'guest_gate' ? 'guest_gate' : 'building')

  const injected = injectDeliverableFollowUps(cleaned)
  if (!injected) return null
  return applyStageGate(injected, 'deliverable')
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
