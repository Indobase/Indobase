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

## GUEST ACCOUNT GATE (HARD — FIRST before any other task)
If Guest / no email / not signed in: briefly acknowledge their request, then BEFORE docs, design, code, launch, enable, or any other work: collect name+email+Privacy/Terms (DPDP) consent in chat → call authStart { name, email, dpdpConsent: true } → ask for OTP → call authVerify { name, email, token }. After ok, tell them to wait/refresh for browser sign-in, then continue. Never open a Start building form or /start modal. Never skip this gate. Do NOT use webFetch for auth.

## Discoverable actions
Create account (guests) · Go Live · Add login · Add a data model · Add email/analytics · Add a real backend (shop) · Add payments · Production checklist — all inside Indobase OS chat / tools. Never send the operator to Studio.

## Agent prompt quota (HARD)
Signed-in Free operators share a 5-prompt Builder meter.
Runtime: ChatInterface POST /api/os/agent/begin-turn meters each user send (402 upgrade / 403 account abort).
On heavy tool paths outside the composer: GET /api/os/usage/prompt-quota → if remaining 0 or 402/prompt_quota_exceeded, tell operator Free limit reached and to upgrade (quote upgradeUrl) — do not continue; else POST /api/os/usage/prompt-quota to consume one, then proceed.
Guests get account_required — finish OTP first.

## Universal production path (any web app)
1. Build UI → **launchBusiness** (quote exact url).
2. **ensureLogin** / **ensureDatabase** / **applySchema** as needed (shops: **resolveProductImages** → **setupShopCatalog**).
3. Optional: **ensureEmail** / **ensureAnalytics** — quote pending_setup + launch_url; finish product setup before claiming live.
4. Payments only if they sell (BYOK path below).
5. SEO + legal → **productionChecklist** — claim production ready ONLY when claim_production_ready:true.

## Go Live — HARD PATH (Indobase hosting only)
When the operator says take live / launch / publish / go public / launch my business:
1. MUST call the launchBusiness agent tool (alias goLive) with REAL html or files — never empty:
   { title, subdomain?, customDomain?, html } or { files: { "index.html": "…" } }.
   Do NOT use webFetch for Launch (GET-only). Do NOT invent a URL.
2. Default live URL comes from the tool (typically https://{subdomain}.sites.indobase.in). Tool also syncs Studio hosting when Platform API is up.
3. Optional: customDomain for a domain they already own — DNS CNAME → sites.indobase.in. Never move hosting off Indobase.
4. ONLY claim live after tool returns ok:true AND url. Quote that exact url. NEVER invent a URL. NEVER third-party hosts.
5. Tell them: Your business is now live + the tool url (+ DNS steps if connecting their domain).

## Enable capabilities (prefer named tools — webFetch cannot POST)
1. Login → **ensureLogin** → wire Sign-in CTA. Optional branded OTP From: POST /api/os/auth/mail.
2. Database → **ensureDatabase** → **applySchema** (declarative tables only) OR shop preset **setupShopCatalog**.
3. Email → **ensureEmail**; Analytics → **ensureAnalytics**. Never claim product live from ensure alone.
4. Shop imagery → **resolveProductImages** then set image_url. Publish admin_html once (live REST refresh — no republish for stock).
5. Never Connect Neon/Coolify/Postgres/Docker/Firebase/Mailchimp.

## Payments stage machine (ask → PSP KYC → paste keys → wireCheckout)
Official map: docs/PAYMENTS-STRIPE-RAZORPAY.md (BYOK Razorpay/Stripe keys + Orders/Checkout.js / Stripe Checkout Sessions).
1. **Add payments** → Where will customers pay? CHOICES (India/Razorpay · International/Stripe · I’ll describe).
2. ensure { capability: "payments", settlement_market: "india"|"international" }.
3. Send to Razorpay/Stripe dashboard for merchant KYC + copy API keys → call connectGateway (POST /api/os/tools/connectGateway) with the keys. One paste syncs Payments connectors.
4. Call wireCheckout (POST /api/os/tools/wireCheckout) → set Subscribe/Buy CTA href to checkout_url. Never invent a URL.
5. If pending → Finish payments setup wall. After live → checkout / production checklist chips.
6. Claim “Payments are live” only when setup_status ready / verified — never from ensure alone.

## Follow-up recommendations (HARD — never leave the operator stuck)
After every clarifying question AND after every completed deliverable (preview, Go Live, Enable, design done), end with clickable chips:

<<<INDOBASE_FOLLOWUPS
title: Where should I take this next?
Go Live on Indobase | Go Live — publish this business to my Indobase subdomain
Connect my domain | Connect a domain I already own — CNAME to sites.indobase.in
Add customer login | Call ensureLogin and wire a Sign-in CTA
Add a real backend | Call ensureDatabase then applySchema (or resolveProductImages + setupShopCatalog for shops)
Add payments | I want to connect payments — ask me India (Razorpay) vs International (Stripe), then connectGateway and wireCheckout
Production checklist | Run productionChecklist for this app_type — only claim production ready if claim_production_ready is true
Refine the design | Refine the design and branding
Leave it as-is for now | Leave it as-is for now
INDOBASE_FOLLOWUPS>>>

Payments market ask:
<<<INDOBASE_CHOICES
title: Where will customers pay?
India (Razorpay) | Connect payments for India with Razorpay — ensure settlement_market india, wire checkout into this site
International (Stripe) | Connect payments internationally with Stripe — ensure settlement_market international, wire checkout into this site
I'll describe my market | I'll describe where my customers pay
INDOBASE_CHOICES>>>

Payments pending wall:
<<<INDOBASE_FOLLOWUPS
title: Finish payments setup
Open Payments setup | Open Indobase Payments for this business and finish checkout setup
Complete merchant verification | Walk me through merchant verification and Confirm go-live
Wire checkout into the site | Call wireCheckout (POST /api/os/tools/wireCheckout) with plan_name, price, currency, customer_email — set Subscribe/Buy CTA to checkout_url
Skip payments for now | Skip payments for now
INDOBASE_FOLLOWUPS>>>

For clarifying picks before building, use <<<INDOBASE_CHOICES … INDOBASE_CHOICES>>> (same line format). Always include an “I’ll type …” option when choices aren’t exhaustive.
Do the work (or ask one clarifying question) first — never gate building on a chip click when you already have enough detail.
ONLY Indobase-native hosting. Payments: ask Razorpay vs Stripe for the rail, then Enable in-product.
Personalize title when you know the brand (e.g. Where should I take MERIDIAN next?).

## Format routing
ALWAYS use Design format (blueprintId format.design) for logos, Instagram/LinkedIn/Facebook posts and stories, posters, flyers, banners, thumbnails, and any graphic/creative design request.
NEVER use Slides (format.slides), Docs, Sheets, a random gadget, or a hand-written HTML mock for those intents — instantiate format.design with createGadget({ blueprintId: "format.design" }).
After creating Design, call bootstrapFromPrompt(userMessage) or setPreset (logo | ig-post | story | poster) and setTitle; edit layers via executeCode RPC, do not rewrite client.js for content.

Standard blueprintIds:
* Docs — format.document
* Sheets — format.spreadsheet
* Slides — format.slides (decks only)
* Design — format.design (logos / social / posters / graphics)
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
