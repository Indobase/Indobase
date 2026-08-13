#!/usr/bin/env node
/**
 * Live first-time-user journey probe against deployed CFOS (.249).
 *
 * This is not a full human walkthrough. It certifies that the deployed
 * instance exposes the contract a non-technical operator needs:
 *   session.project authority, builder workspace, live store purchase path.
 *
 * Full 16-step operator run (click hero, add product, first purchase, Ask AI)
 * still requires a signed-in browser session after this UX is deployed.
 *
 *   CFOS_BASE=https://builder.indobase.in \
 *   STORE_URL=https://corev1-aug13.sites.indobase.in \
 *   node scripts/live-ftu-journey-cert.mjs
 */
import { createHmac, randomBytes } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const BASE = (process.env.CFOS_BASE || 'https://builder.indobase.in').replace(/\/+$/, '')
const STORE = (process.env.STORE_URL || 'https://corev1-aug13.sites.indobase.in').replace(/\/+$/, '')
const COMMERCE = `${BASE}/api/os/commerce`
const REF = process.env.PROJECT_REF || 'roshb77a4744fa'
const REF_B = process.env.PROJECT_REF_B || 'v11xtenantb1'
const SESSION_COOKIE = 'indobase_builder_cfos_session'
const AUDIENCE = 'indobase-builder-cfos'

function secretFromEnv() {
  if (process.env.BUILDER_CFOS_HANDOFF_SECRET) return process.env.BUILDER_CFOS_HANDOFF_SECRET.trim()
  const file = process.env.COMMERCE_WEBHOOK_SECRET_FILE || '.local-secrets/cfos-webhook.env'
  const candidates = [file, `/Volumes/PortableSSD/Indobase/ind-repo/${file}`]
  for (const path of candidates) {
    if (!existsSync(path)) continue
    const raw = readFileSync(path, 'utf8')
    const line = raw
      .split('\n')
      .find((l) => l.startsWith('BUILDER_CFOS_HANDOFF_SECRET=') || l.startsWith('BUILDER_HANDOFF_SECRET='))
    if (line) return line.slice(line.indexOf('=') + 1).trim()
  }
  return ''
}

const SECRET = secretFromEnv()

function b64url(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

function mintSession(projectRef, { expOffset = 3600 } = {}) {
  if (!SECRET || SECRET.length < 32) return ''
  const now = Math.floor(Date.now() / 1000)
  const payload = {
    gotrueId: `ftu_${randomBytes(6).toString('hex')}`,
    email: 'ftu-cert@indobase.in',
    projectRef,
    orgSlug: 'ftu',
    projectName: 'FTU cert',
    studioUrl: 'https://studio.indobase.in',
    exp: now + expOffset,
    iat: now,
    aud: AUDIENCE,
    nonce: randomBytes(8).toString('hex'),
  }
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const body = b64url(JSON.stringify(payload))
  const data = `${header}.${body}`
  const sig = createHmac('sha256', SECRET).update(data).digest()
  return `${data}.${b64url(sig)}`
}

const INTERNAL =
  /\b(backend|database|schema|deployment|capability|PocketBase|Commerce ABI|guidedBackend|ensureDatabase|applySchema|CAS|payment_revision)\b/i

const results = []

function record(id, ok, detail, metric = 'live') {
  results.push({ id, ok, detail, metric })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${id}  ${detail}`)
}

async function get(url, headers = {}) {
  const res = await fetch(url, { headers, redirect: 'follow' })
  const text = await res.text()
  return { status: res.status, text, headers: res.headers }
}

async function json(url, headers = {}) {
  const res = await get(url, { ...headers, Accept: 'application/json' })
  let body = {}
  try {
    body = JSON.parse(res.text)
  } catch {
    body = { raw: res.text.slice(0, 200) }
  }
  return { status: res.status, body, text: res.text }
}

const report = {
  version: 'ftu-journey/v1',
  at: new Date().toISOString(),
  base: BASE,
  store: STORE,
  liveSha: null,
  uxDeployed: false,
  operatorWalkthrough: 'NOT_RUN',
  certified: false,
}

try {
  const health = await json(`${BASE}/sso/health`)
  const sha = health.body?.version || health.body?.gitSha || health.body?.sha || null
  report.liveSha = sha
  record(
    'LIVE-HEALTH',
    health.status === 200 && Boolean(sha),
    `CFOS /sso/health ${health.status} sha=${sha || 'unknown'}`,
    'completion',
  )
} catch (err) {
  record('LIVE-HEALTH', false, `health unreachable: ${err.message}`, 'completion')
}

try {
  const session = await json(`${BASE}/api/session`)
  const hasProjectShape =
    session.status === 200 &&
    session.body?.project &&
    typeof session.body.project.state === 'string' &&
    Array.isArray(session.body.project.capabilities) &&
    Array.isArray(session.body.project.nav)
  const guestOk = session.status === 401 || session.status === 200
  record(
    'LIVE-SESSION',
    guestOk,
    `GET /api/session → ${session.status}${session.body?.project ? ' (project present)' : ''}`,
    'completion',
  )
  record(
    'LIVE-PROJECT',
    hasProjectShape || session.status === 401,
    hasProjectShape
      ? `session.project state=${session.body.project.state}`
      : session.status === 401
        ? 'unauthenticated (expected); project shape needs a signed-in run'
        : 'session.project missing — UX not on this SHA',
    'cognitive_load',
  )
  report.uxDeployed = hasProjectShape
} catch (err) {
  record('LIVE-SESSION', false, err.message, 'completion')
}

try {
  const home = await get(`${BASE}/`)
  const html = home.text || ''
  const hasWorkspace = /__INDOBASE_PROJECT__|WorkspaceChrome|What do you want to launch\?/.test(html)
  const leaked = INTERNAL.test(html) && /guidedBackend|Commerce ABI|PocketBase|ensureDatabase/.test(html)
  record('LIVE-HOME', home.status === 200, `builder home ${home.status} bytes=${html.length}`, 'completion')
  record(
    'LIVE-UX-SURFACE',
    hasWorkspace,
    hasWorkspace ? 'builder HTML exposes workspace / project authority' : 'deployed HTML lacks workspace chrome',
    'completion',
  )
  record('LIVE-LEXICON', !leaked, leaked ? 'builder HTML leaks internal terms' : 'no ABI/backend leak in home HTML', 'cognitive_load')
  report.uxDeployed = report.uxDeployed || hasWorkspace
} catch (err) {
  record('LIVE-HOME', false, err.message, 'completion')
}

try {
  const store = await get(STORE)
  const html = store.text || ''
  const hasCatalog = /id="grid"|indobase\.commerce|product/i.test(html)
  const hasCheckout = /commerce\.checkout|Guest checkout|checkout/i.test(html)
  record('LIVE-STORE', store.status === 200 && hasCatalog, `storefront ${store.status} catalog=${hasCatalog}`, 'completion')
  record('LIVE-CHECKOUT', hasCheckout, hasCheckout ? 'guest checkout path present' : 'no checkout surface', 'completion')
} catch (err) {
  record('LIVE-STORE', false, err.message, 'completion')
}

try {
  const products = await json(`${COMMERCE}/products?projectRef=${encodeURIComponent(REF)}`)
  const list = Array.isArray(products.body?.products)
    ? products.body.products
    : Array.isArray(products.body?.items)
      ? products.body.items
      : Array.isArray(products.body)
        ? products.body
        : []
  record(
    'LIVE-PRODUCTS',
    products.status === 200 && list.length > 0,
    `commerce products ${products.status} count=${list.length}`,
    'completion',
  )
} catch (err) {
  record('LIVE-PRODUCTS', false, err.message, 'completion')
}

try {
  const anon = await json(`${COMMERCE}/admin/snapshot?projectRef=${encodeURIComponent(REF)}`)
  record(
    'LIVE-10',
    anon.status === 401 || anon.status === 403,
    anon.status === 200
      ? 'admin snapshot is world-readable by projectRef'
      : `anonymous snapshot ${anon.status}`,
    'recovery',
  )
} catch (err) {
  record('LIVE-10', false, err.message, 'recovery')
}

if (SECRET.length >= 32) {
  const cookieA = mintSession(REF)
  const expired = mintSession(REF, { expOffset: -120 })
  try {
    const own = await json(`${COMMERCE}/admin/snapshot`, {
      cookie: `${SESSION_COOKIE}=${cookieA}`,
    })
    record(
      'LIVE-14',
      own.status === 200 && own.body?.ok === true,
      `A→A snapshot ${own.status} orders=${Array.isArray(own.body?.orders) ? own.body.orders.length : 'n/a'}`,
      'completion',
    )
    const sessionA = await json(`${BASE}/api/session`, { cookie: `${SESSION_COOKIE}=${cookieA}` })
    const project = sessionA.body?.project
    record(
      'LIVE-08',
      sessionA.status === 200 && typeof project?.state === 'string' && Array.isArray(project?.nav),
      sessionA.status === 200
        ? `session.project state=${project?.state} nav=${(project?.nav || []).length}`
        : `signed-in session ${sessionA.status}`,
      'cognitive_load',
    )
    report.uxDeployed = report.uxDeployed || (sessionA.status === 200 && Boolean(project))
  } catch (err) {
    record('LIVE-08', false, err.message, 'cognitive_load')
    record('LIVE-14', false, err.message, 'completion')
  }
  try {
    const cross = await json(`${COMMERCE}/admin/snapshot?projectRef=${encodeURIComponent(REF_B)}`, {
      cookie: `${SESSION_COOKIE}=${cookieA}`,
      'X-Indobase-Project-Ref': REF_B,
    })
    record(
      'LIVE-11',
      cross.status === 403,
      `A→B snapshot ${cross.status} code=${cross.body?.code || 'none'}`,
      'recovery',
    )
  } catch (err) {
    record('LIVE-11', false, err.message, 'recovery')
  }
  try {
    const dead = await json(`${COMMERCE}/admin/snapshot`, {
      cookie: `${SESSION_COOKIE}=${expired}`,
    })
    record('LIVE-16', dead.status === 401, `expired session snapshot ${dead.status}`, 'recovery')
  } catch (err) {
    record('LIVE-16', false, err.message, 'recovery')
  }
} else {
  record('LIVE-08', false, 'handoff secret missing — cannot mint signed-in session', 'cognitive_load')
  record('LIVE-11', false, 'handoff secret missing — cannot prove A→B isolation', 'recovery')
  record('LIVE-14', false, 'handoff secret missing — cannot read A snapshot', 'completion')
  record('LIVE-16', false, 'handoff secret missing — cannot prove expiry', 'recovery')
}

record(
  'LIVE-WALKTHROUGH',
  false,
  'Signed-in 16-step operator walkthrough NOT_RUN (click-to-edit → launch → first purchase → Ask AI)',
  'agent_intervention',
)

const required = results.filter((r) => r.id !== 'LIVE-WALKTHROUGH' && r.id !== 'LIVE-LEXICON' && r.id !== 'LIVE-UX-SURFACE')
report.security = {
  anonymousDenied: results.find((r) => r.id === 'LIVE-10')?.ok === true,
  ownerAllowed: results.find((r) => r.id === 'LIVE-14')?.ok === true,
  crossProjectDenied: results.find((r) => r.id === 'LIVE-11')?.ok === true,
  expiredDenied: results.find((r) => r.id === 'LIVE-16')?.ok === true,
}
report.securityCertified = Object.values(report.security).every(Boolean)
report.probeOk = required.every((r) => r.ok)
report.walkthrough = 'NOT_RUN'
report.certified = false
report.checks = results
report.note = report.securityCertified
  ? 'Control Center authorization holds on .249. 16-step human walkthrough still required before Builder UX certified.'
  : 'Control Center authorization is not green on this SHA.'

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'ecommerce-ftu-journey-cert.json')
writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`)
console.log(
  `\ncertified=${report.certified} security=${report.securityCertified} probe=${report.probeOk} sha=${report.liveSha || 'unknown'}`,
)
console.log(`wrote ${out}`)
process.exit(report.securityCertified ? 0 : 2)
