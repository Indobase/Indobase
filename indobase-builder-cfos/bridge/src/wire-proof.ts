/**
 * Prove published HTML/files are wired to Indobase backend (not localStorage-only).
 */

import { isManagedPublicKey } from './pocketbase/managed.js'
import type { BackendConfig } from './auth.js'

const WIRE_MARKERS =
  /__INDOBASE_ENV__|INDOBASE_URL|INDOBASE_COLLECTION_PREFIX|INDOBASE_RECORDS_BASE|\/api\/collections\/|ib_[a-z0-9]+_|VITE_INDOBASE_URL|NEXT_PUBLIC_INDOBASE_URL|auth-with-otp|request-otp/i

const LOCAL_ONLY =
  /localStorage|sessionStorage/i

export function collectLaunchText(input: {
  html?: string | null
  files?: Record<string, string> | null
}): string {
  const parts: string[] = []
  if (typeof input.html === 'string' && input.html.trim()) parts.push(input.html)
  if (input.files && typeof input.files === 'object') {
    for (const [path, content] of Object.entries(input.files)) {
      if (typeof content !== 'string') continue
      if (/\.(html?|js|mjs|cjs|ts|tsx|jsx|json|env)$/i.test(path) || !path.includes('.')) {
        parts.push(content)
      }
    }
  }
  return parts.join('\n')
}

export function contentLooksLikeDataApp(text: string): boolean {
  if (!text.trim()) return false
  return /(add to cart|checkout|sign[\s-]?in|log[\s-]?in|dashboard|book now|appointment|products?|orders?|supabase|fetch\(|api_url|anon_key)/i.test(
    text,
  )
}

export function inferAppTypeFromContent(text: string): string | null {
  const t = text.toLowerCase()
  if (/(add to cart|checkout|product grid|sku|inventory|storefront)/i.test(t)) return 'ecommerce'
  if (/(book now|appointment|availability|calendar slot)/i.test(t)) return 'booking'
  if (/(dashboard|admin panel|metrics)/i.test(t)) return 'dashboard'
  if (/(sign[\s-]?in|log[\s-]?in|saas|workspace|organization)/i.test(t)) return 'saas'
  if (/(blog|article|cms|post)/i.test(t)) return 'blog'
  return null
}

export type WireProofResult =
  | { ok: true; wired: boolean }
  | { ok: false; code: 'wire_required'; message: string }

/**
 * When a backend is required, content must reference Indobase records env / collections.
 * Pure localStorage carts fail the gate.
 */
export function assertLaunchWireReady(input: {
  html?: string | null
  files?: Record<string, string> | null
  backend?: BackendConfig | null
  requireWire: boolean
}): WireProofResult {
  if (!input.requireWire) return { ok: true, wired: false }

  const text = collectLaunchText(input)
  if (!text.trim()) {
    return {
      ok: false,
      code: 'wire_required',
      message:
        'Go Live needs html/files wired to session.backend (INDOBASE_URL / __INDOBASE_ENV__ / /api/collections). Rebuild the UI against the Indobase backend, then launchBusiness again.',
    }
  }

  const hasWire = WIRE_MARKERS.test(text)
  const onlyLocal = LOCAL_ONLY.test(text) && !hasWire

  if (onlyLocal || !hasWire) {
    const api = input.backend?.api_url || 'session.backend.api_url'
    const prefix =
      input.backend?.public_env?.INDOBASE_COLLECTION_PREFIX ||
      (input.backend?.project_ref ? `ib_${input.backend.project_ref}_` : 'ib_<project_ref>_')
    return {
      ok: false,
      code: 'wire_required',
      message:
        `UI is not wired to the Indobase backend. Use ${api} with collection prefix ${prefix}` +
        ` (GET/POST ${api.replace(/\/+$/, '')}/api/collections/{prefix}{table}/records)` +
        (isManagedPublicKey(input.backend?.anon_key)
          ? '; auth via users OTP + Bearer user token (no Kong anon key).'
          : '.') +
        ' Replace localStorage-only data, then launchBusiness again.',
    }
  }

  return { ok: true, wired: true }
}
