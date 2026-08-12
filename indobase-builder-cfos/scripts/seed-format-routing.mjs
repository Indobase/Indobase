#!/usr/bin/env node
/**
 * Seed AdminConfig format agentHints + instanceInstructions so the CF OS agent
 * always routes logo/social/poster intents to format.design on first try.
 *
 * Requires an ADMINS username (local/VPS run-dev-server defaults include admin +
 * Indobase rebrand also adds "dev").
 *
 * Usage:
 *   node scripts/seed-format-routing.mjs
 *   CLOUDFLARE_OS_URL=http://127.0.0.1:8787 VITE_DEV_USERNAME=admin VITE_DEV_PASSWORD=… \
 *     node scripts/seed-format-routing.mjs
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OS = process.env.CLOUDFLARE_OS_DIR || join(ROOT, 'upstream/cloudflare-os')
const FE = join(OS, 'packages/workshop-frontend')
const CFOS_URL = (process.env.CLOUDFLARE_OS_URL || 'http://127.0.0.1:8787').replace(/\/+$/, '')
const WS_URL = CFOS_URL.replace(/^http/, 'ws') + '/api'

const requireFe = createRequire(join(FE, 'package.json'))

const SERVICE_SALT = new Uint8Array([
  0xd9, 0x4e, 0x54, 0x1d, 0x29, 0xc1, 0x03, 0x74, 0x73, 0x7e, 0xb3, 0xe3, 0x34, 0x6d, 0x8f, 0x21,
])

const FORMAT_HINTS = {
  'format.document':
    'Prefer for written documents, memos, contracts, and long-form text — not single-image graphics.',
  'format.spreadsheet':
    'Prefer for spreadsheets, tables, budgets, and numeric trackers.',
  'format.slides':
    'Prefer for multi-slide decks/presentations only. NEVER for logos, social posts, stories, posters, flyers, banners, or single-image graphics — use Design (format.design).',
  'format.design':
    'ALWAYS for logos, Instagram/LinkedIn/Facebook posts & stories, posters, flyers, banners, thumbnails, graphic design, creatives. NEVER Slides or HTML mocks. createGadget blueprintId format.design; then setPreset.',
}

const INSTANCE_INSTRUCTIONS = `# Indobase OS (mandatory)

## GUEST GATE (HARD — only when unsigned-in)
First: call \`sessionStatus\` (or treat begin-turn /api/session guest:false / stage:member as signed-in). If already a member with email / signed_in:true, **SKIP signup entirely** — do not ask name/email/Privacy/OTP/Create account; continue the ORIGINAL request immediately.
Only if guest/unsigned-in: acknowledge → collect name+email+Privacy/Terms (DPDP) → authStart { name, email, dpdpConsent:true } → OTP → authVerify { name, email, token }. **During this auth turn emit NO CHOICES/FOLLOWUPS cards** (no niche chips). After verify ok: wait/refresh for sign-in, then continue the ORIGINAL request and only then emit niche CHOICES if needed. No Start building modal. No webFetch for auth. Never leak CoT (“Considering…”) into chat.

## Zero → One journey (HARD — full launch via chips)
**North star:** take the operator to a full launch (\`launchBusiness\` live url → domain/payments/checklist) via recommendation chips. Loop: clarify → deliver → chips → execute + prove → chips until live. Never stall after 1–2 chip rounds.
Cards prefer agent-authored <<<INDOBASE_FOLLOWUPS>>> / CHOICES (UI may inject next ladder stage if omitted).
Stage gate: guest_gate=**no chips** (auth only) · after sign-in building=≤4 launch-ladder CHOICES · deliverable/payments=≤4 personalized toward live.
1. Clear build ask → ack → guest gate if unsigned-in (**no recommendation cards yet**).
2. Guest gate turn → name/email/DPDP/OTP only; after verify, continue ORIGINAL request then niche CHOICES if needed — do not re-ask auth.
3. After signed-in, ecommerce niche unknown → CHOICES \`What will your store sell?\` then **preview only** (localStorage cart) **unless** operator intent is clear (launch store / add real backend / take live / create admin) — then **AUTO-CHAIN**: call \`guidedBackend mode=ecommerce\` + \`placeTestShopOrder\` in the same turn without preview-only micro-prompts. Niche chips must use catalog vertical ids (apparel, electronics, food-grocery, beauty). Niche must NOT call guidedBackend on preview-only path. App type unclear → app-type CHOICES. Clear landing/store ask → do not ask SaaS vs shop.
4. **LANDING SINGLE-TURN (HARD):** clear landing/marketing / "website for X" (no store/shop/backend) → invent brand, build HTML, call \`launchBusiness app_type=landing\` in the **same turn**. No continue/take-live micro-prompts. Skip guidedBackend / PocketBase ecommerce. After url: Domain / Analytics / Checklist.
5. **Auto-chain triggers (HARD):** launch store|shop, add real backend, take live (with store/backend context), create admin → immediately \`guidedBackend mode=ecommerce place_test_order=true\` → publish managed **storefront_html** (Commerce runtime) → Go Live. Skip 7-prompt preview ladder when intent is explicit.
6. **Default store ladder (preview path):** niche → preview FOLLOWUPS (**Go Live first**) → optional Add a real backend → Go Live (managed commerce storefront) → Add payments → connectGateway → checklist. Speak business outcomes on chip labels.
7. **Preview-first** for ambiguous launch store/landing/website: invent brand, build UI, summarize What's in it, emit 2–4 FOLLOWUPS \`Where should I take {Brand} next?\` with Go Live first (not Leave-as-is). No payments wall on first preview.
8. On chip/ask: run stage with tools; prove; **always** emit next-stage chips toward full launch. **Go Live chip → immediately call launchBusiness** (prefer guidedBackend storefront_html; quote exact url; never invent). Ecommerce Go Live is a release gate — on \`contract_verifier_failed\` repair storefront, do not invent URLs. After Go Live: Domain / Add payments (stores) or Analytics (landings) / Checklist mandatory. Prefer named tools over webFetch. Respect Journey state + store ladder on agent_hint.

## Commerce ABI (HARD — all ecommerce apps)
Storefronts use **only** \`window.indobase.commerce\` (products / cart / checkout / orders). Checkout = \`commerce.checkout.create\` → \`POST /api/os/commerce/checkout\` (server prices, reserves stock, creates order).
**FORBIDDEN for agents to invent:** PocketBase \`/api/collections/…/orders\` POST, client-side price/total/stock mutation, payment credentials, checkout/order APIs, inventory writes.
**ALLOWED:** HTML/CSS/branding/layout; localStorage **cart UX only**; publish \`storefront_html\` from guidedBackend (or launchBusiness — bridge replaces localStorage carts with managed commerce shell).
After guidedBackend ecommerce: prefer tool \`storefront_html\` as index.html — do not hand-roll checkout.

## Preview surface (HARD)
After first HTML exists: prefer **launchBusiness** static URL (\`*.sites.indobase.in\`) for shareable preview — NOT Gadget iframe (localStorage SecurityError). Never tell the operator to use Gadget iframe as the preview link. Go Live early for preview; iframe is codegen-only fallback. Honor \`launch.enforce_static_over_gadget\`.

## Quota & governance
Free: 5 prompts (ChatInterface /api/os/agent/begin-turn). Outside composer: GET/POST /api/os/usage/prompt-quota; on 0/402 stop + quote upgradeUrl + session.governance.prompt_quota_exceeded choices. Guests: finish OTP first.
Payments BYOK: on gateway_not_ready explain Razorpay/Stripe KYC → connectGateway (never invent hosted PSP keys). Quote session.governance / tool.governance.

## Production path (hybrid)
**Landing single-turn:** clear landing/marketing/"website for X" → Build UI + launchBusiness app_type=landing in one turn (skip guidedBackend); quote exact url; then Domain (customDomain CNAME @/www → sites.indobase.in; no auto-verify) / ensureAnalytics / Checklist.
Landing / clear store preview (ambiguous): Build UI → FOLLOWUPS → launchBusiness on Go Live (real html/files; quote exact url; never invent; *.sites.indobase.in; customDomain CNAME → sites.indobase.in).
Store after Add a real backend / auto-chain: guidedBackend + placeTestShopOrder → publish **storefront_html** (Commerce ABI) → Go Live → payments when asked (India/Razorpay → connectGateway).
SaaS/booking/dashboard: guidedBackend mode=generic (ensureLogin + ensureDatabase + applySchema) → wire UI to session.backend for **non-shop** data screens → launchBusiness with app_type.
Optional ensureEmail / ensureAnalytics — after Go Live offer ensureAnalytics chip (non-blocking).
productionChecklist — claim ready only if claim_production_ready:true.
Never Neon/Coolify/Firebase/Mailchimp, mock APIs, or third-party hosts.

## Payments (BYOK)
Ask market → ensure payments + settlement_market → Razorpay/Stripe KYC + connectGateway keys. Hosted paymentUrl comes from **commerce.checkout** when gateway ready (or Add payments after Go Live). Never invent PSP credentials (session.governance.gateway_not_ready).

Chip format (rewrite every time — do not copy labels verbatim):
<<<INDOBASE_FOLLOWUPS
title: Where should I take Aural next?
Polish hero with product shots | Refine the Aural hero with close-up headphone photography
Go Live on Indobase | Go Live — publish Aural to my Indobase subdomain
Add a real backend | Call guidedBackend for Aural then publish the commerce storefront
INDOBASE_FOLLOWUPS>>>

Payments market (only when they ask):
<<<INDOBASE_CHOICES
title: Where will customers pay?
India (Razorpay) | Payments India/Razorpay — ensure settlement_market india, then KYC + connectGateway
International (Stripe) | Payments international/Stripe — ensure settlement_market international, then KYC + connectGateway
I'll describe my market | I'll describe where customers pay
INDOBASE_CHOICES>>>

## Format routing
ALWAYS format.design for logos/social/posters/graphics (createGadget + bootstrapFromPrompt/setPreset). NEVER Slides/Docs/Sheets/HTML mocks for those. Docs=format.document Sheets=format.spreadsheet Slides=format.slides (decks only).
`

function argValue(flag) {
  const i = process.argv.indexOf(flag)
  return i >= 0 ? process.argv[i + 1] : undefined
}

async function hashPassword(username, password) {
  const { argon2id } = await import(pathToFileURL(requireFe.resolve('hash-wasm')).href)
  const usernameBuf = new TextEncoder().encode(username)
  const salt = new Uint8Array(SERVICE_SALT.length + usernameBuf.length)
  salt.set(SERVICE_SALT)
  salt.set(usernameBuf, SERVICE_SALT.length)
  return argon2id({
    password,
    salt,
    parallelism: 1,
    iterations: 3,
    memorySize: 65536,
    hashLength: 32,
    outputType: 'binary',
  })
}

async function connectRpc() {
  const { newWebSocketRpcSession } = await import(pathToFileURL(requireFe.resolve('capnweb')).href)
  return newWebSocketRpcSession(WS_URL)
}

async function loginAs(api, username, password) {
  const passwordHash = await hashPassword(username, password)
  let token = await api.createAccount(username, username, passwordHash)
  if (!token) token = await api.login(username, passwordHash)
  if (!token) return null
  return api.authenticate(token)
}

async function main() {
  const usernames = [
    process.env.VITE_DEV_USERNAME,
    argValue('--user'),
    'admin',
    'dev',
  ].filter(Boolean)
  const password = process.env.VITE_DEV_PASSWORD || argValue('--password') || 'devpassword'

  console.log(`CF OS: ${CFOS_URL}`)
  const api = await connectRpc()

  let auth = null
  let usedUser = null
  for (const username of [...new Set(usernames)]) {
    try {
      auth = await loginAs(api, username, password)
      if (!auth) continue
      const admin = await auth.getAdminApi()
      if (admin) {
        usedUser = username
        console.log(`Logged in as admin user ${username}`)
        await seedAdmin(admin)
        process.exit(0)
      }
      console.log(`User ${username} is not in ADMINS; trying next…`)
    } catch (err) {
      console.warn(`Login as ${username} failed:`, err?.message || err)
    }
  }

  console.error(
    'Could not obtain AdminApi. Ensure ADMINS includes admin or dev ' +
      '(Indobase rebrand patches run-dev-server), then retry.',
  )
  process.exit(1)
}

async function seedAdmin(admin) {
  const settings = await admin.getSettings()
  const promoted = new Set((settings.formats || []).map((f) => f.blueprintId))

  for (const blueprintId of Object.keys(FORMAT_HINTS)) {
    if (!promoted.has(blueprintId)) {
      try {
        await admin.promoteFormat(blueprintId)
        console.log(`Promoted ${blueprintId}`)
      } catch (err) {
        console.warn(`Could not promote ${blueprintId}:`, err?.message || err)
      }
    }
  }

  for (const [blueprintId, agentHint] of Object.entries(FORMAT_HINTS)) {
    await admin.updateFormat(blueprintId, { enabled: true, agentHint })
    console.log(`agentHint → ${blueprintId}`)
  }

  // Prefer Design early in the menu / agent catalog after Docs/Sheets.
  const after = await admin.getSettings()
  const ids = (after.formats || []).map((f) => f.blueprintId)
  const preferredOrder = [
    'format.document',
    'format.spreadsheet',
    'format.design',
    'format.slides',
  ]
  const ordered = [
    ...preferredOrder.filter((id) => ids.includes(id)),
    ...ids.filter((id) => !preferredOrder.includes(id)),
  ]
  if (ordered.length === ids.length && ordered.length > 0) {
    try {
      await admin.setFormatOrder(ordered)
      console.log(`Format order → ${ordered.join(', ')}`)
    } catch (err) {
      console.warn('setFormatOrder skipped:', err?.message || err)
    }
  }

  // Always replace (never append) — CFOS caps instanceInstructions at 8000 chars.
  await admin.setInstanceInstructions(INSTANCE_INSTRUCTIONS)
  console.log(
    `instanceInstructions refreshed (${INSTANCE_INSTRUCTIONS.length} chars; any-app hard paths + follow-ups + Design)`,
  )

  const final = await admin.getSettings()
  const design = (final.formats || []).find((f) => f.blueprintId === 'format.design')
  if (!design?.enabled || !/ALWAYS/i.test(design.agentHint || '')) {
    throw new Error('format.design missing enabled ALWAYS agentHint after seed')
  }
  console.log('Done. Design format routing seeded for the agent catalog.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
