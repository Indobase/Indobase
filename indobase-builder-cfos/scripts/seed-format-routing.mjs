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

## GUEST GATE (HARD — before other work)
Guest / no email: acknowledge request, then collect name+email+Privacy/Terms (DPDP) → authStart { name, email, dpdpConsent:true } → OTP → authVerify { name, email, token }. After ok: wait/refresh for sign-in, then continue the ORIGINAL request. No Start building modal. No webFetch for auth. **This turn: no FOLLOWUPS chips** (no Go Live / payments / checklist).

## Goal → gate → build → cards (HARD)
Cards are **agent-authored only** (<<<INDOBASE_FOLLOWUPS>>> / CHOICES). UI invents nothing — no block → no cards.
Stage gate (timing): guest_gate=0 chips · building=goal CHOICES only (≤4) · deliverable/payments=≤4 personalized.
1. Clear build ask → ack → guest gate if unsigned-in.
2. Guest gate turn → **zero chips**; after verify, build the ORIGINAL request.
3. Building → no Go Live/payments/checklist wall; at most one goal-tied CHOICE block if blocked.
4. Deliverable only → emit 2–4 personalized chips for THIS brand/goal (never paste a fixed 8-card menu).
5. Payments CHOICES only if they ask for payments.
Clear “create a website for X” is enough — do not ask SaaS vs shop first. Prefer named tools over webFetch POST.

## Quota
Free: 5 prompts (ChatInterface /api/os/agent/begin-turn). Outside composer: GET/POST /api/os/usage/prompt-quota; on 0/402 stop + quote upgradeUrl. Guests: finish OTP first.

## Production path (ensure-first)
Classify early. Landing/marketing only: Build UI → launchBusiness (real html/files; quote exact url; never invent; *.sites.indobase.in; customDomain CNAME → sites.indobase.in).
Apps with login/data (SaaS, shop, booking, blog CMS, dashboard): ensureLogin and/or ensureDatabase → applySchema or guidedBackend/setupShopCatalog FIRST → build UI against session.backend → launchBusiness. Prefer guidedBackend for ecommerce / “Add a real backend”.
Optional ensureEmail / ensureAnalytics — pending_setup until product setup done.
productionChecklist — claim ready only if claim_production_ready:true.
Never Neon/Coolify/Firebase/Mailchimp, mock APIs, or third-party hosts.

## Payments (BYOK)
Ask market → ensure payments + settlement_market → Razorpay/Stripe KYC + connectGateway keys → wireCheckout → set Buy CTA to checkout_url. Claim “Payments are live” only when verified.

Chip format (rewrite every time — do not copy labels verbatim):
<<<INDOBASE_FOLLOWUPS
title: Where should I take Aural next?
Polish hero with product shots | Refine the Aural hero with close-up headphone photography
Go Live on Indobase | Go Live — publish Aural to my Indobase subdomain
Wire Buy CTA | Add checkout for the Buy button when I am ready
INDOBASE_FOLLOWUPS>>>

Payments market (only when they ask):
<<<INDOBASE_CHOICES
title: Where will customers pay?
India (Razorpay) | Payments India/Razorpay — ensure settlement_market india, then KYC + connectGateway + wireCheckout
International (Stripe) | Payments international/Stripe — ensure settlement_market international, then KYC + connectGateway + wireCheckout
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
