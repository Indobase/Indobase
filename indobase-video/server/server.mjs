/**
 * Indobase Video — Studio SSO + static SPA host (zero npm deps at runtime).
 *
 * GET  /sso/launch#token=<HS256 aud=indobase-video>
 * POST /sso/session          → verify handoff, set ib_video_sso cookie
 * GET  /sso/me               → current session JSON
 * GET  /sso/health           → liveness
 * GET  /*                    → SPA (requires session cookie; else Studio sign-in)
 */

import crypto from 'node:crypto'
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PORT = Number(process.env.PORT || 8780)
const STATIC_ROOT = process.env.STATIC_ROOT || path.join(__dirname, '../web/dist')

const HANDOFF_SECRET = (
  process.env.VIDEO_HANDOFF_SECRET ||
  process.env.STUDIO_HANDOFF_SECRET ||
  ''
).trim()
if (HANDOFF_SECRET.length < 32) {
  console.error('FATAL: VIDEO_HANDOFF_SECRET / STUDIO_HANDOFF_SECRET must be >= 32 chars')
  process.exit(1)
}

const STUDIO_PUBLIC_URL = (process.env.STUDIO_PUBLIC_URL || 'https://studio.indobase.in').replace(
  /\/+$/,
  ''
)
const PUBLIC_ORIGIN = (process.env.PUBLIC_ORIGIN || 'https://video.indobase.in').replace(/\/+$/, '')
const HANDOFF_AUD = 'indobase-video'
const COOKIE_NAME = 'ib_video_sso'
/** Session length after successful Studio handoff (12h). */
const SESSION_TTL_S = 60 * 60 * 12

const b64url = (buf) =>
  Buffer.from(buf).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')

const fromB64url = (str) => Buffer.from(str.replace(/-/g, '+').replace(/_/g, '/'), 'base64')

const timingSafeEq = (a, b) => {
  const ba = Buffer.from(a)
  const bb = Buffer.from(b)
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb)
}

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
  if (!payload.sub || !payload.email || !payload.project_ref) return null
  return payload
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
  const expected = b64url(
    crypto.createHmac('sha256', HANDOFF_SECRET).update(`cookie.${body}`).digest()
  )
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

/** Long-lived bearer for Studio Video APIs (aud=indobase-video-api). */
function mintVideoApiToken(session) {
  const now = Math.floor(Date.now() / 1000)
  const payload = {
    aud: 'indobase-video-api',
    email: session.email,
    exp: typeof session.exp === 'number' ? session.exp : now + SESSION_TTL_S,
    iat: now,
    iss: STUDIO_PUBLIC_URL,
    organization_slug: session.organization_slug || '',
    project_name: session.project_name || session.project_ref,
    project_ref: session.project_ref,
    role: session.role || 'viewer',
    studio_url: session.studio_url || STUDIO_PUBLIC_URL,
    sub: session.sub,
  }
  const headerB64 = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const payloadB64 = b64url(JSON.stringify(payload))
  const data = `${headerB64}.${payloadB64}`
  const signature = b64url(crypto.createHmac('sha256', HANDOFF_SECRET).update(data).digest())
  return `${data}.${signature}`
}

function parseCookies(req) {
  const out = {}
  const raw = req.headers.cookie || ''
  for (const part of raw.split(';')) {
    const i = part.indexOf('=')
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim())
  }
  return out
}

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

const LAUNCH_PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex" />
<meta name="theme-color" content="#0B1220" />
<title>Indobase Video</title>
<link rel="icon" href="/favicon.ico" />
<style>
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
    background:#0B1220;color:#F8FAFC;font:14px/1.45 ui-sans-serif,system-ui,sans-serif}
  .card{text-align:center;padding:2rem}
  .mark{width:48px;height:48px;margin:0 auto 1rem}
  .muted{opacity:.7}
</style>
</head>
<body>
  <div class="card">
    <img class="mark" src="/indobase-logo.svg" alt="Indobase" />
    <p>Opening <strong>Indobase Video</strong>…</p>
    <p class="muted" id="status">Verifying Studio session</p>
  </div>
<script>
(function () {
  var studio = ${JSON.stringify(STUDIO_PUBLIC_URL)};
  var statusEl = document.getElementById('status');
  var params = new URLSearchParams(location.search);
  var projectRef = params.get('project_ref') || '';
  var hash = new URLSearchParams(location.hash.replace(/^#/, ''));
  var token = hash.get('token') || params.get('token') || '';
  if (!token) {
    var ret = projectRef
      ? '/project/' + encodeURIComponent(projectRef) + '/marketing'
      : '/';
    location.replace(studio + '/sign-in?returnTo=' + encodeURIComponent(ret));
    return;
  }
  history.replaceState({}, '', location.pathname + (projectRef ? ('?project_ref=' + encodeURIComponent(projectRef)) : ''));
  fetch('/sso/session', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ token: token })
  }).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
    .then(function (res) {
      if (!res.ok) throw new Error(res.j && res.j.message || 'SSO failed');
      var ref = (res.j && res.j.project_ref) || projectRef;
      location.replace('/editor' + (ref ? ('?project_ref=' + encodeURIComponent(ref)) : ''));
    })
    .catch(function (err) {
      statusEl.textContent = err.message || 'SSO failed';
      setTimeout(function () {
        location.replace(studio + '/sign-in');
      }, 1800);
    });
})();
</script>
</body>
</html>`

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
  '.json': 'application/json',
  '.map': 'application/json',
  '.woff2': 'font/woff2',
}

function safeJoin(root, reqPath) {
  const decoded = decodeURIComponent(reqPath.split('?')[0])
  const cleaned = path.normalize(decoded).replace(/^(\.\.[/\\])+/, '')
  const full = path.join(root, cleaned)
  if (!full.startsWith(root)) return null
  return full
}

function serveStatic(req, res, urlPath) {
  let filePath = safeJoin(STATIC_ROOT, urlPath === '/' ? '/index.html' : urlPath)
  if (!filePath) {
    res.writeHead(400)
    return res.end('bad path')
  }
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(STATIC_ROOT, 'index.html')
  }
  if (!fs.existsSync(filePath)) {
    res.writeHead(404)
    return res.end('not found')
  }
  const ext = path.extname(filePath)
  const type = MIME[ext] || 'application/octet-stream'
  res.writeHead(200, { 'content-type': type, 'cache-control': ext === '.html' ? 'no-store' : 'public, max-age=3600' })
  fs.createReadStream(filePath).pipe(res)
}

function getSession(req) {
  const cookies = parseCookies(req)
  return verifyCookie(cookies[COOKIE_NAME])
}

function studioRedirect(projectRef) {
  const ret = projectRef
    ? `/project/${encodeURIComponent(projectRef)}/marketing`
    : '/'
  return `${STUDIO_PUBLIC_URL}/sign-in?returnTo=${encodeURIComponent(ret)}`
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', PUBLIC_ORIGIN)
  const pathname = url.pathname

  try {
    if (req.method === 'GET' && (pathname === '/sso/health' || pathname === '/api/health')) {
      return sendJson(res, 200, {
        ok: true,
        service: 'indobase-video',
        product: 'Indobase Video',
      })
    }

    if (req.method === 'GET' && pathname === '/sso/launch') {
      return sendHtml(res, 200, LAUNCH_PAGE)
    }

    if (req.method === 'POST' && pathname === '/sso/session') {
      const raw = await readBody(req)
      let token = ''
      try {
        const parsed = JSON.parse(raw || '{}')
        token = parsed.token || ''
      } catch {
        const form = new URLSearchParams(raw)
        token = form.get('token') || ''
      }
      const claims = verifyHandoffToken(token)
      if (!claims) return sendJson(res, 401, { message: 'invalid or expired handoff token' })

      const session = {
        sub: claims.sub,
        email: claims.email,
        project_ref: claims.project_ref,
        project_name: claims.project_name || claims.project_ref,
        organization_slug: claims.organization_slug || '',
        role: claims.role || 'viewer',
        studio_url: claims.studio_url || STUDIO_PUBLIC_URL,
        exp: Math.floor(Date.now() / 1000) + SESSION_TTL_S,
      }
      const cookie = signCookie(session)
      const secure = PUBLIC_ORIGIN.startsWith('https')
      return sendJson(
        res,
        200,
        {
          ok: true,
          project_ref: session.project_ref,
          project_name: session.project_name,
          email: session.email,
          api_token: mintVideoApiToken(session),
        },
        {
          'set-cookie': `${COOKIE_NAME}=${encodeURIComponent(cookie)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL_S}${secure ? '; Secure' : ''}`,
        }
      )
    }

    if (req.method === 'GET' && pathname === '/sso/me') {
      const session = getSession(req)
      if (!session) return sendJson(res, 401, { message: 'unauthorized' })
      return sendJson(res, 200, {
        email: session.email,
        sub: session.sub,
        project_ref: session.project_ref,
        project_name: session.project_name,
        organization_slug: session.organization_slug,
        role: session.role,
        studio_url: session.studio_url || STUDIO_PUBLIC_URL,
        api_token: mintVideoApiToken(session),
      })
    }

    if (req.method === 'POST' && pathname === '/sso/logout') {
      return sendJson(res, 200, { ok: true }, {
        'set-cookie': `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`,
      })
    }

    // Public brand assets (favicon/logo) without session — needed on launch page
    if (
      req.method === 'GET' &&
      (pathname === '/favicon.ico' ||
        pathname === '/favicon-32.png' ||
        pathname === '/indobase-logo.svg' ||
        pathname === '/indobase-logo-wordmark.svg' ||
        pathname === '/site.webmanifest')
    ) {
      return serveStatic(req, res, pathname)
    }

    if (req.method === 'GET') {
      const session = getSession(req)
      if (!session) {
        const projectRef = url.searchParams.get('project_ref') || ''
        res.writeHead(302, { Location: studioRedirect(projectRef) })
        return res.end()
      }
      return serveStatic(req, res, pathname)
    }

    res.writeHead(405)
    res.end('method not allowed')
  } catch (err) {
    console.error(err)
    sendJson(res, 500, { message: 'internal error' })
  }
})

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Indobase Video listening on :${PORT} (static=${STATIC_ROOT})`)
})
