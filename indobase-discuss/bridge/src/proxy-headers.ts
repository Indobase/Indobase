/**
 * Strip hop/encoding headers undici has already resolved on the decoded body.
 *
 * Streaming `fetch()` → `Response(res.body)` through undici has crashed this
 * bridge (`assert(!this.paused)`), which Traefik surfaces as HTTP 502 and can
 * truncate JS mid-transfer. Callers should buffer `arrayBuffer()` and set an
 * explicit Content-Length after sanitizing.
 */
export function sanitizeProxiedResponseHeaders(headers: Headers): Headers {
  const out = new Headers(headers)
  out.delete('server')
  out.delete('x-powered-by')
  // undici already decoded gzip/br. Keeping Content-Encoding (and the compressed
  // Content-Length) makes browsers gunzip plaintext CSS/JS → assets fail.
  out.delete('content-encoding')
  out.delete('content-length')
  out.delete('transfer-encoding')
  out.delete('connection')
  out.delete('keep-alive')
  return out
}

/**
 * Build upstream request headers. Force identity encoding so Node never
 * auto-decompresses while leaving mismatched Content-Encoding / Length.
 *
 * `siteHost` is the Frappe site name (e.g. discuss.localhost). Without a
 * matching Host / X-Frappe-Site-Name, multi-site benches can serve the wrong
 * site or guest shells that leave the Vue app blank.
 */
export function buildUpstreamProxyHeaders(
  incoming: Headers,
  opts?: { siteHost?: string }
): Headers {
  const headers = new Headers(incoming)
  headers.delete('host')
  headers.delete('connection')
  headers.delete('keep-alive')
  headers.delete('transfer-encoding')
  headers.delete('content-length')
  // fetch()/undici cannot perform HTTP upgrades — strip so polling stays on the
  // buffered proxy path. Real WebSocket upgrades are handled on the Node server.
  headers.delete('upgrade')
  headers.set('accept-encoding', 'identity')
  const siteHost = (opts?.siteHost || '').trim()
  if (siteHost) {
    headers.set('host', siteHost)
    headers.set('X-Frappe-Site-Name', siteHost)
  }
  return headers
}
