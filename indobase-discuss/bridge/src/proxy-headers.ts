/** Strip hop/encoding headers undici has already resolved on the decoded body. */
export function sanitizeProxiedResponseHeaders(headers: Headers): Headers {
  const out = new Headers(headers)
  out.delete('server')
  out.delete('x-powered-by')
  // undici already decoded gzip/br. Keeping Content-Encoding (and the compressed
  // Content-Length) makes browsers gunzip plaintext CSS/JS → assets fail.
  out.delete('content-encoding')
  out.delete('content-length')
  out.delete('transfer-encoding')
  return out
}
