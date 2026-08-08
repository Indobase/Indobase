/**
 * Brand stripping — customer-facing surfaces must never name the agent runtime vendor.
 * Internal env keys / comments may still say CF OS.
 */

/** Phrases that must not appear in operator/customer UI copy. */
export const VENDOR_BRAND_PATTERNS: readonly RegExp[] = [
  /\bCloudflare\s+OS\b/gi,
  /\bCloudflare\s+Workers?\b/gi,
  /\bcloudflare\.com\b/gi,
  /\bos\.cloudflare\.app\b/gi,
  /\bWorkers\s+AI\b/gi,
  /\bCap'n\s+Web\b/gi,
  /\bCapn\s+Web\b/gi,
  // Upstream UI term — map to Indobase "App"
  /\bGadgets?\b/g,
]

const REPLACEMENTS: Array<{ pattern: RegExp; replacement: string }> = [
  { pattern: /\bCloudflare\s+OS\b/gi, replacement: 'Indobase OS' },
  { pattern: /\bCloudflare\s+Workers?\b/gi, replacement: 'Indobase runtime' },
  { pattern: /\bos\.cloudflare\.app\b/gi, replacement: 'builder.indobase.in' },
  { pattern: /\bcloudflare\.com\b/gi, replacement: 'indobase.in' },
  { pattern: /\bWorkers\s+AI\b/gi, replacement: 'Indobase Agent' },
  { pattern: /\bCap'n\s+Web\b/gi, replacement: 'Indobase Gatekeeper' },
  { pattern: /\bCapn\s+Web\b/gi, replacement: 'Indobase Gatekeeper' },
  { pattern: /\bGadgets\b/g, replacement: 'Apps' },
  { pattern: /\ban?\s+Gadget\b/g, replacement: 'an App' },
  { pattern: /\bGadget\b/g, replacement: 'App' },
]

/** Rewrite vendor product naming to Indobase terms for UI / agent hints. */
export function stripVendorBranding(text: string): string {
  let out = text
  for (const { pattern, replacement } of REPLACEMENTS) {
    out = out.replace(pattern, replacement)
  }
  return out
}

/** True when text still contains forbidden vendor product naming. */
export function hasVendorBranding(text: string): boolean {
  return VENDOR_BRAND_PATTERNS.some((re) => {
    re.lastIndex = 0
    return re.test(text)
  })
}

/** Throws when customer-facing copy still names the vendor. */
export function assertNoVendorBranding(text: string, label = 'text'): void {
  if (hasVendorBranding(text)) {
    throw new Error(
      `Customer-facing ${label} still contains vendor product naming. Use stripVendorBranding() / Indobase terms.`,
    )
  }
}
