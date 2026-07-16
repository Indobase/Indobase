import { getPlanEntitlements } from './plan-entitlements'

/** Inject or strip Indobase badge HTML based on org plan. */
export function applyIndobaseBadgeToHtml(html: string, plan: string | null | undefined): string {
  const entitlements = getPlanEntitlements(plan)
  const BADGE_MARKER = 'data-indobase-badge'
  const BADGE_HTML = `<a ${BADGE_MARKER}="1" href="https://indobase.in" target="_blank" rel="noopener noreferrer" style="position:fixed;bottom:12px;right:12px;z-index:2147483646;display:inline-flex;align-items:center;gap:6px;padding:6px 10px;border-radius:999px;background:#111;color:#fff;font:600 12px/1.2 system-ui,sans-serif;text-decoration:none;box-shadow:0 4px 14px rgba(0,0,0,.18)">Made with Indobase</a>`

  const without = html.replace(
    new RegExp(`<a[^>]*${BADGE_MARKER}=["']?1["']?[^>]*>[\\s\\S]*?<\\/a>`, 'gi'),
    ''
  )

  if (!entitlements.showIndobaseBadge) {
    return without
  }

  if (without.includes(BADGE_MARKER)) {
    return without
  }

  if (/<\/body>/i.test(without)) {
    return without.replace(/<\/body>/i, `${BADGE_HTML}</body>`)
  }

  return `${without}\n${BADGE_HTML}`
}

export function planRequiresIndobaseBadge(plan: string | null | undefined): boolean {
  return getPlanEntitlements(plan).showIndobaseBadge
}

export function planHasBackendStudio(plan: string | null | undefined): boolean {
  return getPlanEntitlements(plan).backendStudio
}
