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
Only if guest/unsigned-in: acknowledge → collect name+email+Privacy/Terms (DPDP) → authStart { name, email, dpdpConsent:true } → OTP → authVerify { name, email, token }. **Guest turn MAY emit niche / app-type CHOICES** (store vertical or “What kind of web app is this?”). **Never** emit Go Live / Launch / payments / checklist walls while Guest. After verify ok: continue the ORIGINAL request immediately — do **not** ask them to wait or refresh. No Start building modal. No webFetch for auth. Never leak CoT (“Considering…”) into chat. Never claim the store is live until project.state=live.

## Production Launch Job (HARD — platform owns the stages)
For Launch a SaaS / Store / Landing, Go Live, or take live: call **launchProductionApp** (\`POST /api/os/apps/launch\`). The job owns provision, catalog, and commerce. Quote jobId + stages. Claim a URL **only** when status=live and claim_live=true. Draft preview may use launchBusiness with production:false.
GENERATE: invent Vite+React UI from session.launch.generate blueprint+skills (not a cloned starter). Vague asks: niche/app-type CHOICES first — do not AUTO-CHAIN or invent a brand. Named brand+vertical (UrbanThread apparel) → BUILD/GENERATE immediately. Platform compiles dist/. If awaiting_generate or react_build_failed, POST the same jobId + file tree.

## Zero → One journey (HARD — full launch via chips)
**North star:** take the operator to a **production launch job** (\`POST /api/os/apps/launch\` → live url → domain/payments/checklist). Loop: clarify → job → chips until live. Never stall after 1–2 chip rounds.
Cards prefer agent-authored <<<INDOBASE_FOLLOWUPS>>> / CHOICES (UI may inject next ladder stage if omitted).
Stage gate: guest_gate=**auth + optional niche/app-type CHOICES** (no Go Live/payments) · building=≤4 launch-ladder CHOICES · deliverable/payments=≤4 personalized toward live.
1. Clear named brand+vertical → ack → guest gate if unsigned-in (niche cards optional) → **BUILD** immediately after verify.
2. Guest gate turn → name/email/DPDP/OTP; **niche/app-type CHOICES OK**; never Go Live/payments that turn. After verify, continue ORIGINAL request — do not re-ask auth.
3. Vague “ordering site / infer the rest” or unknown niche → CHOICES \`What will your store sell?\` **first**, then BUILD after they pick. Do **not** AUTO-CHAIN or invent a brand. Named UrbanThread/apparel → skip cards, BUILD preview. Niche ids: apparel, electronics, food-grocery, beauty. App type unclear → app-type CHOICES. Named store/landing → do not ask SaaS vs shop.
4. **LANDING SINGLE-TURN (HARD):** clear landing/marketing / "website for X" (no store/shop/backend) → POST /api/os/apps/launch { appType:"landing", production:true } in the **same turn**. No continue/take-live micro-prompts. After status=live: Domain / Checklist.
5. **Go Live / take live** (after preview ready) → **launchProductionApp**. Do not skip CHOICES on a vague first ask. The job owns catalog + commerce when they asked for a store.
6. **Default store ladder:** vague → niche CHOICES → BUILD preview FOLLOWUPS (**Launch my store first**) → Go Live → Add payments → connectGateway → checklist.
7. After a niche is known: build UI, summarize What's in it, emit 2–4 FOLLOWUPS with Launch first. No payments wall on first preview.
8. On chip/ask: **Go Live / take live** → POST /api/os/apps/launch. Quote job stages; never invent a URL. After status=live: Domain / Add payments (stores) / Checklist.

## Commerce ABI (HARD — all ecommerce apps)
Storefronts use **only** \`window.indobase.commerce\` (products / cart / checkout / orders). Checkout = \`commerce.checkout.create\` → \`POST /api/os/commerce/checkout\` (server prices, reserves stock, creates order).
**FORBIDDEN for agents to invent:** PocketBase \`/api/collections/…/orders\` POST, client-side price/total/stock mutation, payment credentials, checkout/order APIs, inventory writes.
**ALLOWED:** HTML/CSS/branding/layout; localStorage **cart UX only**. The launch job publishes the managed commerce storefront — do not hand-roll checkout.

## Preview surface (HARD)
Websites/stores/apps: do **not** show the site in the Builder Gadget pane — publish to \`*.sites.indobase.in\` / Open site. Gadget preview is for documents, Instagram/social posts, Design, slides, and other formats. Never tell the operator the Gadget pane is the store.

## Quota & governance
Free: 5 prompts (ChatInterface /api/os/agent/begin-turn). Outside composer: GET/POST /api/os/usage/prompt-quota; on 0/402 stop + quote upgradeUrl + session.governance.prompt_quota_exceeded choices. Guests: finish OTP first.
Payments BYOK: on gateway_not_ready explain Razorpay/Stripe KYC → connectGateway (never invent hosted PSP keys). Quote session.governance / tool.governance.

## Production path (hybrid)
**Landing / SaaS / Store production:** POST /api/os/apps/launch with appType. The job provisions (when needed), generates or uses html, verifies, deploys, smokes. Quote live URL only when status=live.
Draft preview only: launchBusiness with production:false.
Do not offer analytics chips. productionChecklist — claim ready only if claim_production_ready:true.
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
