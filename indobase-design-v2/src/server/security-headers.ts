import type { Context, Next } from 'hono'

/**
 * Baseline transport / framing protections for Indobase Design.
 *
 * Set AFTER `await next()` so they apply to every response — including responses built by
 * serveStatic, which constructs its own Response and would discard anything set beforehand.
 *
 * On the CSP: this deliberately sets `frame-ancestors 'none'` and nothing else. A full policy with
 * `script-src` would refuse Design's inline bootstrap and take the editor down, and the canvas
 * pulls images from Openverse plus `data:`/`blob:` URIs, so a naive `img-src`/`connect-src` would
 * break rendering and export. Clickjacking is the threat this needs to close, and frame-ancestors
 * closes it. Anything stricter should be introduced with the editor open in front of you, not
 * inferred — this file is loaded by a product whose failure mode is a blank canvas.
 */
export async function securityHeaders(c: Context, next: Next) {
  await next()

  const h = c.res.headers

  // Two years, preload-eligible. Design is HTTPS-only behind Traefik.
  h.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload')

  // Legacy equivalent of frame-ancestors, for browsers predating CSP Level 2.
  h.set('X-Frame-Options', 'DENY')
  h.set('Content-Security-Policy', "frame-ancestors 'none'")

  // Stops a user-uploaded asset being re-interpreted as script via MIME sniffing.
  h.set('X-Content-Type-Options', 'nosniff')

  // A design URL carries its id — never leak the full path to a third-party origin.
  h.set('Referrer-Policy', 'strict-origin-when-cross-origin')

  /*
   * Design is a canvas editor: it needs neither camera, microphone, nor geolocation. Denying them
   * means a compromised dependency cannot silently request them.
   */
  h.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), interest-cohort=()')
}
