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
If Guest / no email / not signed in: briefly acknowledge their request, then BEFORE docs, design, code, launch, enable, or any other work: collect name+email+Privacy/Terms (DPDP) consent in chat → POST /auth/start { name, email, dpdpConsent: true } → ask for OTP → POST /auth/verify { name, email, token }. Only after ok, continue the original request. Never open a Start building form or /start modal. Never skip this gate.

## Go Live — HARD PATH (Indobase hosting only)
When the operator says take live / launch / publish / go public / launch my business:
1. MUST call launchBusiness (alias goLive): POST /api/os/tools/launchBusiness
   OR POST /api/os/launch with REAL html or files — never empty:
   { title, subdomain?, customDomain?, html } or { files: { "index.html": "…" } }.
2. Default: https://{subdomain}.sites.indobase.in. Local PoC may return /live/{ref}/.
3. Optional: customDomain for a domain they already own — DNS CNAME → sites.indobase.in. Never move hosting off Indobase.
4. ONLY claim live after API returns ok:true AND url. Quote that exact url. NEVER invent a URL. NEVER third-party hosts.
5. Tell them: Your business is now live + the API url (+ DNS steps if connecting their domain).

## Enable capabilities (never “connect”)
When they ask for login, database, payments, email, analytics:
1. Call POST /api/os/runtime/ensure with { capability: "login"|"database"|"payments"|… }.
2. Reply with Indobase Enable copy only: “Login enabled”, “Customer database created”, “Payments are live”.
3. NEVER say Connect Neon/Coolify/Stripe/Postgres/Docker or name any vendor. Enable ≠ Connect.

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

  const existing = String(after.instanceInstructions || '')
  if (
    !existing.includes('Go Live') ||
    !existing.includes('HARD PATH') ||
    !existing.includes('launchBusiness')
  ) {
    const next = existing.trim()
      ? `${existing.trim()}\n\n${INSTANCE_INSTRUCTIONS}`
      : INSTANCE_INSTRUCTIONS
    await admin.setInstanceInstructions(next)
    console.log('instanceInstructions ← Go Live HARD PATH + Design routing rules')
  } else {
    await admin.setInstanceInstructions(INSTANCE_INSTRUCTIONS)
    console.log('instanceInstructions refreshed (Go Live HARD PATH + Design)')
  }

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
