/**
 * Reverse-proxy Cloudflare OS through the Indobase bridge.
 *
 * Primary UX: GET `/` proxies CFOS index as the top document (no iframe shell).
 * Legacy path `/os/app/*` still works (prefix rewrite + frame-ancestors for embeds).
 *
 * CF OS builds use root-absolute `/assets/*` and a WebSocket at `/api`.
 * Those root paths are also proxied (session-gated) so CLOUDFLARE_OS_URL can stay
 * internal (not browser-reachable).
 */
import type { Context } from 'hono'

const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailers',
  'transfer-encoding',
  'upgrade',
  'host',
  'content-length',
])

const STRIP_RESPONSE = new Set([
  'x-frame-options',
  'content-security-policy',
  'content-security-policy-report-only',
  'cross-origin-opener-policy',
  'cross-origin-embedder-policy',
  'cross-origin-resource-policy',
  // Node fetch decompresses bodies; never forward upstream encoding / validators.
  'content-encoding',
  'content-length',
  'etag',
  'age',
  'cf-cache-status',
  'cf-ray',
])

export function resolveCloudflareOsBase(): string {
  return (process.env.CLOUDFLARE_OS_URL || '').trim().replace(/\/+$/, '')
}

/** Rewrite root-absolute src/href so they stay under the proxy prefix. */
export function rewriteHtmlForProxyPrefix(html: string, stripPrefix: string): string {
  const prefix = stripPrefix.replace(/\/+$/, '') || ''
  if (!prefix) return html
  return html.replace(/\b(src|href)=("|')\/(?!\/)/gi, (full, attr: string, quote: string, offset: number, source: string) => {
    const pathStart = offset + full.length - 1 // index of leading '/'
    const rest = source.slice(pathStart)
    if (rest === prefix || rest.startsWith(`${prefix}/`)) return full
    return `${attr}=${quote}${prefix}/`
  })
}

export async function proxyCloudflareOs(
  c: Context,
  opts: {
    upstreamBase: string
    stripPrefix: string
    /** Force upstream path (e.g. serve CFOS `/` for bridge `GET /workspace`). */
    overridePath?: string
  },
) {
  const url = new URL(c.req.url)
  let path = opts.overridePath ?? url.pathname
  if (!opts.overridePath && path.startsWith(opts.stripPrefix)) {
    path = path.slice(opts.stripPrefix.length) || '/'
  }
  if (!path.startsWith('/')) path = `/${path}`

  const target = new URL(path + url.search, `${opts.upstreamBase}/`)

  const headers = new Headers()
  c.req.raw.headers.forEach((value, key) => {
    if (HOP_BY_HOP.has(key.toLowerCase())) return
    if (key.toLowerCase() === 'cookie') return // keep CF OS cookies separate; bridge session stays on bridge
    headers.set(key, value)
  })
  headers.set('host', target.host)
  // Avoid compressed body complications when rewriting HTML
  headers.delete('accept-encoding')

  const init: RequestInit = {
    method: c.req.method,
    headers,
    redirect: 'manual',
  }

  if (c.req.method !== 'GET' && c.req.method !== 'HEAD') {
    init.body = c.req.raw.body
    // @ts-expect-error duplex required for streaming body in Node fetch
    init.duplex = 'half'
  }

  let upstream: Response
  try {
    upstream = await fetch(target, init)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'upstream unreachable'
    return c.json(
      {
        ok: false,
        message: `Cloudflare OS proxy failed: ${message}`,
        upstream: opts.upstreamBase,
      },
      502
    )
  }

  const outHeaders = new Headers()
  upstream.headers.forEach((value, key) => {
    const lower = key.toLowerCase()
    if (HOP_BY_HOP.has(lower) || STRIP_RESPONSE.has(lower)) return
    // Rewrite absolute redirects to upstream back through the proxy prefix
    if (lower === 'location') {
      try {
        const loc = new URL(value, target)
        if (loc.origin === new URL(opts.upstreamBase).origin) {
          outHeaders.set(
            'location',
            `${opts.stripPrefix}${loc.pathname}${loc.search}${loc.hash}`
          )
          return
        }
      } catch {
        // keep as-is
      }
    }
    outHeaders.set(key, value)
  })

  // Legacy /os/app embeds may still need framing; top-document `/` gets DENY from securityHeaders.
  if (opts.stripPrefix) {
    outHeaders.set('Content-Security-Policy', "frame-ancestors 'self'")
    outHeaders.delete('X-Frame-Options')
  }
  // Session-gated agent UI — never let edges / browsers cache empty or stale shells.
  outHeaders.set('Cache-Control', 'private, no-store, no-cache, must-revalidate')
  outHeaders.set('Pragma', 'no-cache')

  const contentType = upstream.headers.get('content-type') || ''
  if (contentType.includes('text/html') && c.req.method === 'GET') {
    // fetch() already decoded gzip/br — body must be served without content-encoding.
    const html = await upstream.text()
    const rewritten = rewriteHtmlForProxyPrefix(html, opts.stripPrefix)
    return new Response(rewritten, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: outHeaders,
    })
  }

  // Buffer non-HTML too so we never stream a compressed body after stripping encoding headers.
  const body = Buffer.from(await upstream.arrayBuffer())
  return new Response(body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: outHeaders,
  })
}
