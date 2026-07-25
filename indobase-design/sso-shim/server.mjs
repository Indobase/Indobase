/**
 * Indobase Design SSO shim — bridges Studio handoff JWTs to Penpot OIDC.
 *
 * Penpot only speaks OIDC for external auth, and Studio is not an OIDC
 * provider. This tiny service (no npm dependencies) is both:
 *
 *   1. The Studio launch target:  GET /sso/launch#token=<HS256 handoff JWT>
 *      A small HTML page posts the fragment token to POST /sso/session which
 *      verifies it (aud=indobase-design, shared HMAC secret) and sets a
 *      short-lived signed cookie. It then kicks off Penpot's own OIDC flow.
 *
 *   2. A minimal OIDC provider for Penpot:
 *      - GET  /.well-known/openid-configuration   (internal, discovery)
 *      - GET  /sso/oidc/authorize                  (public, browser)
 *      - POST /oidc/token                          (internal, backend)
 *      - GET  /oidc/userinfo                       (internal, backend)
 *      - GET  /oidc/jwks                           (internal, backend)
 *
 * Identity comes exclusively from the verified Studio handoff cookie, so the
 * only way to get a Penpot session is via Studio ("Kill public password
 * signup on Design host" — password login is disabled via PENPOT_FLAGS).
 */

import crypto from 'node:crypto'
import http from 'node:http'

const PORT = Number(process.env.PORT || 8600)

const HANDOFF_SECRET = (
  process.env.DESIGN_HANDOFF_SECRET ||
  process.env.STUDIO_HANDOFF_SECRET ||
  ''
).trim()
if (HANDOFF_SECRET.length < 32) {
  console.error('FATAL: DESIGN_HANDOFF_SECRET / STUDIO_HANDOFF_SECRET must be >= 32 chars')
  process.exit(1)
}

const OIDC_CLIENT_ID = (process.env.OIDC_CLIENT_ID || 'indobase-studio').trim()
const OIDC_CLIENT_SECRET = (process.env.OIDC_CLIENT_SECRET || '').trim()
if (OIDC_CLIENT_SECRET.length < 16) {
  console.error('FATAL: OIDC_CLIENT_SECRET must be >= 16 chars')
  process.exit(1)
}

/** Issuer as seen by the Penpot backend (container-internal). */
const OIDC_ISSUER = (process.env.OIDC_ISSUER || `http://design-sso:${PORT}`).replace(/\/+$/, '')
/** Public origin of the Design host (browser-facing). */
const PUBLIC_ORIGIN = (process.env.PUBLIC_ORIGIN || 'https://design.indobase.in').replace(/\/+$/, '')
const STUDIO_PUBLIC_URL = (process.env.STUDIO_PUBLIC_URL || 'https://studio.indobase.in').replace(/\/+$/, '')

const HANDOFF_AUD = 'indobase-design'
const COOKIE_NAME = 'ib_design_sso'
const COOKIE_TTL_S = 300

// ---------------------------------------------------------------------------
// Crypto helpers
// ---------------------------------------------------------------------------

const b64url = (buf) =>
  Buffer.from(buf).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')

const fromB64url = (str) => Buffer.from(str.replace(/-/g, '+').replace(/_/g, '/'), 'base64')

const timingSafeEq = (a, b) => {
  const ba = Buffer.from(a)
  const bb = Buffer.from(b)
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb)
}

/** Verify an HS256 JWT signed with the shared handoff secret. */
function verifyHandoffToken(token) {
  const parts = String(token || '').split('.')
  if (parts.length !== 3) return null
  const [h, p, s] = parts
  const expected = b64url(crypto.createHmac('sha256', HANDOFF_SECRET).update(`${h}.${p}`).digest())
  if (!timingSafeEq(expected, s)) return null
  let payload
  try {
    payload = JSON.parse(fromB64url(p).toString('utf8'))
  } catch {
    return null
  }
  const now = Math.floor(Date.now() / 1000)
  if (payload.aud !== HANDOFF_AUD) return null
  if (typeof payload.exp !== 'number' || payload.exp < now) return null
  if (!payload.sub || !payload.email) return null
  return payload
}

// RSA keypair for id_token signing (ephemeral: tokens live for minutes only).
const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 })
const KID = crypto.randomBytes(8).toString('hex')
const PUBLIC_JWK = { ...publicKey.export({ format: 'jwk' }), kid: KID, use: 'sig', alg: 'RS256' }

function signIdToken(claims) {
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: KID }))
  const payload = b64url(JSON.stringify(claims))
  const data = `${header}.${payload}`
  const sig = crypto.createSign('RSA-SHA256').update(data).sign(privateKey)
  return `${data}.${b64url(sig)}`
}

function signCookie(payload) {
  const body = b64url(JSON.stringify(payload))
  const sig = b64url(crypto.createHmac('sha256', HANDOFF_SECRET).update(`cookie.${body}`).digest())
  return `${body}.${sig}`
}

function verifyCookie(value) {
  const parts = String(value || '').split('.')
  if (parts.length !== 2) return null
  const [body, sig] = parts
  const expected = b64url(crypto.createHmac('sha256', HANDOFF_SECRET).update(`cookie.${body}`).digest())
  if (!timingSafeEq(expected, sig)) return null
  let payload
  try {
    payload = JSON.parse(fromB64url(body).toString('utf8'))
  } catch {
    return null
  }
  if (typeof payload.exp !== 'number' || payload.exp * 1000 < Date.now()) return null
  return payload
}

// ---------------------------------------------------------------------------
// Short-lived in-memory stores (single-instance service)
// ---------------------------------------------------------------------------

const codes = new Map() // code -> { identity, nonce, redirectUri, exp }
const accessTokens = new Map() // token -> { identity, exp }

setInterval(() => {
  const now = Date.now()
  for (const [k, v] of codes) if (v.exp < now) codes.delete(k)
  for (const [k, v] of accessTokens) if (v.exp < now) accessTokens.delete(k)
}, 30_000).unref()

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

const sendJson = (res, status, body, headers = {}) => {
  const data = JSON.stringify(body)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    ...headers,
  })
  res.end(data)
}

const sendHtml = (res, status, html) => {
  res.writeHead(status, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' })
  res.end(html)
}

const readBody = (req) =>
  new Promise((resolve, reject) => {
    let data = ''
    req.on('data', (c) => {
      data += c
      if (data.length > 64 * 1024) reject(new Error('body too large'))
    })
    req.on('end', () => resolve(data))
    req.on('error', reject)
  })

function parseCookies(req) {
  const out = {}
  const raw = req.headers.cookie || ''
  for (const part of raw.split(';')) {
    const i = part.indexOf('=')
    if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim()
  }
  return out
}

function clientCredentials(req, form) {
  const auth = req.headers.authorization || ''
  if (auth.startsWith('Basic ')) {
    const [id, ...rest] = Buffer.from(auth.slice(6), 'base64').toString('utf8').split(':')
    return { id: decodeURIComponent(id || ''), secret: decodeURIComponent(rest.join(':') || '') }
  }
  return { id: form.get('client_id') || '', secret: form.get('client_secret') || '' }
}

// ---------------------------------------------------------------------------
// Launch page (served on the public host under /sso/launch)
// ---------------------------------------------------------------------------

const LAUNCH_PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex" />
<title>Indobase Design</title>
<style>
  body { margin:0; display:flex; align-items:center; justify-content:center; min-height:100vh;
         background:#0f0f0f; color:#ededed; font-family:system-ui,-apple-system,sans-serif; }
  .card { text-align:center; }
  .spin { width:28px; height:28px; margin:0 auto 16px; border:3px solid #333;
          border-top-color:#d4a843; border-radius:50%; animation:s 0.8s linear infinite; }
  @keyframes s { to { transform:rotate(360deg) } }
  p { color:#9a9a9a; font-size:14px; }
</style>
</head>
<body>
<div class="card">
  <div class="spin"></div>
  <h1 style="font-size:18px;font-weight:600;margin:0 0 6px">Opening Indobase Design…</h1>
  <p id="msg">Signing you in with your Studio account.</p>
</div>
<script>
(function () {
  var studio = __STUDIO_URL__;
  function fail(msg) {
    document.getElementById('msg').textContent = msg + ' Redirecting to Studio…';
    setTimeout(function () { window.location.replace(studio); }, 2500);
  }
  var hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  var token = hash.get('token');
  if (!token) return fail('Missing sign-in token.');
  fetch('/sso/session', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token: token }),
    credentials: 'same-origin',
  })
    .then(function (r) {
      if (!r.ok) throw new Error('session rejected');
      // Start Penpot's own OIDC flow (it signs the state parameter itself).
      return fetch('/api/auth/oauth/oidc', {
        method: 'POST',
        headers: { accept: 'application/json', 'content-type': 'application/json' },
        body: '{}',
        credentials: 'same-origin',
      })
    })
    .then(function (r) { return r.text() })
    .then(function (text) {
      var m = text.match(/https?:\\/\\/[^"\\\\ ]+/)
      if (!m) throw new Error('no redirect uri in ' + text.slice(0, 120))
      window.location.replace(m[0])
    })
    .catch(function (e) { fail('Could not start the session (' + e.message + ').') })
})();
</script>
</body>
</html>`

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`)
  const path = url.pathname.replace(/\/+$/, '') || '/'

  try {
    if (req.method === 'GET' && (path === '/sso/health' || path === '/health')) {
      return sendJson(res, 200, { ok: true, service: 'indobase-design-sso' })
    }

    if (req.method === 'GET' && path === '/sso/launch') {
      return sendHtml(res, 200, LAUNCH_PAGE.replace('__STUDIO_URL__', JSON.stringify(STUDIO_PUBLIC_URL)))
    }

    if (req.method === 'POST' && path === '/sso/session') {
      let body
      try {
        body = JSON.parse((await readBody(req)) || '{}')
      } catch {
        return sendJson(res, 400, { message: 'Invalid JSON' })
      }
      const payload = verifyHandoffToken(body.token)
      if (!payload) return sendJson(res, 401, { message: 'Invalid or expired handoff token' })
      const identity = {
        sub: String(payload.sub),
        email: String(payload.email).toLowerCase(),
        name: String(payload.email).split('@')[0],
        project_ref: payload.project_ref || null,
        exp: Math.floor(Date.now() / 1000) + COOKIE_TTL_S,
      }
      const cookie = [
        `${COOKIE_NAME}=${signCookie(identity)}`,
        'Path=/sso',
        `Max-Age=${COOKIE_TTL_S}`,
        'HttpOnly',
        'Secure',
        'SameSite=Lax',
      ].join('; ')
      return sendJson(res, 200, { ok: true }, { 'set-cookie': cookie })
    }

    if (req.method === 'GET' && (path === '/sso/oidc/authorize' || path === '/oidc/authorize')) {
      const clientId = url.searchParams.get('client_id') || ''
      const redirectUri = url.searchParams.get('redirect_uri') || ''
      const state = url.searchParams.get('state') || ''
      const nonce = url.searchParams.get('nonce') || ''
      if (clientId !== OIDC_CLIENT_ID || !redirectUri.startsWith(`${PUBLIC_ORIGIN}/`)) {
        return sendJson(res, 400, { message: 'Invalid client_id or redirect_uri' })
      }
      const identity = verifyCookie(parseCookies(req)[COOKIE_NAME])
      if (!identity) {
        // No verified Studio handoff -> back to Studio sign-in, never a local form.
        res.writeHead(302, { location: `${STUDIO_PUBLIC_URL}/sign-in?returnTo=design` })
        return res.end()
      }
      const code = crypto.randomBytes(24).toString('hex')
      codes.set(code, { identity, nonce, redirectUri, exp: Date.now() + 120_000 })
      const target = new URL(redirectUri)
      target.searchParams.set('code', code)
      if (state) target.searchParams.set('state', state)
      res.writeHead(302, { location: target.toString() })
      return res.end()
    }

    if (req.method === 'POST' && (path === '/oidc/token' || path === '/sso/oidc/token')) {
      const form = new URLSearchParams(await readBody(req))
      const creds = clientCredentials(req, form)
      if (creds.id !== OIDC_CLIENT_ID || !timingSafeEq(creds.secret, OIDC_CLIENT_SECRET)) {
        return sendJson(res, 401, { error: 'invalid_client' })
      }
      const grant = codes.get(form.get('code') || '')
      codes.delete(form.get('code') || '')
      if (!grant || grant.exp < Date.now()) {
        return sendJson(res, 400, { error: 'invalid_grant' })
      }
      const accessToken = crypto.randomBytes(24).toString('hex')
      accessTokens.set(accessToken, { identity: grant.identity, exp: Date.now() + 300_000 })
      const now = Math.floor(Date.now() / 1000)
      const idToken = signIdToken({
        iss: OIDC_ISSUER,
        sub: grant.identity.sub,
        aud: OIDC_CLIENT_ID,
        exp: now + 300,
        iat: now,
        email: grant.identity.email,
        email_verified: true,
        name: grant.identity.name,
        ...(grant.nonce ? { nonce: grant.nonce } : {}),
      })
      return sendJson(res, 200, {
        access_token: accessToken,
        token_type: 'Bearer',
        expires_in: 300,
        id_token: idToken,
      })
    }

    if (req.method === 'GET' && (path === '/oidc/userinfo' || path === '/sso/oidc/userinfo')) {
      const auth = req.headers.authorization || ''
      const token = auth.startsWith('Bearer ') ? auth.slice(7) : url.searchParams.get('access_token')
      const entry = accessTokens.get(token || '')
      if (!entry || entry.exp < Date.now()) {
        return sendJson(res, 401, { error: 'invalid_token' })
      }
      const { identity } = entry
      return sendJson(res, 200, {
        sub: identity.sub,
        email: identity.email,
        email_verified: true,
        name: identity.name,
        preferred_username: identity.name,
      })
    }

    if (req.method === 'GET' && path === '/.well-known/openid-configuration') {
      return sendJson(res, 200, {
        issuer: OIDC_ISSUER,
        authorization_endpoint: `${PUBLIC_ORIGIN}/sso/oidc/authorize`,
        token_endpoint: `${OIDC_ISSUER}/oidc/token`,
        userinfo_endpoint: `${OIDC_ISSUER}/oidc/userinfo`,
        jwks_uri: `${OIDC_ISSUER}/oidc/jwks`,
        response_types_supported: ['code'],
        subject_types_supported: ['public'],
        id_token_signing_alg_values_supported: ['RS256'],
        scopes_supported: ['openid', 'profile', 'email'],
        grant_types_supported: ['authorization_code'],
        token_endpoint_auth_methods_supported: ['client_secret_basic', 'client_secret_post'],
        claims_supported: ['sub', 'email', 'email_verified', 'name'],
      })
    }

    if (req.method === 'GET' && (path === '/oidc/jwks' || path === '/sso/oidc/jwks')) {
      return sendJson(res, 200, { keys: [PUBLIC_JWK] })
    }

    return sendJson(res, 404, { message: 'Not found' })
  } catch (error) {
    console.error('sso-shim error', error)
    return sendJson(res, 500, { message: 'Internal error' })
  }
})

server.listen(PORT, () => {
  console.log(`indobase-design sso-shim listening on :${PORT}`)
  console.log(`  issuer:        ${OIDC_ISSUER}`)
  console.log(`  public origin: ${PUBLIC_ORIGIN}`)
  console.log(`  studio:        ${STUDIO_PUBLIC_URL}`)
})
