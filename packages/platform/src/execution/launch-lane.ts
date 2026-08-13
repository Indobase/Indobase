/**
 * Two-lane Launch — static default; data engine only on demand (ADR 0005 + 0008).
 *
 * business.launch → execution.publish → artifact → static/SSR → domain → HTTPS → LIVE.
 * A landing/static business must not require PocketBase provision.
 */

export type LaunchLane = 'static' | 'capability'

export type ResolveLaunchLaneInput = {
  appType?: string | null
  requiredCapabilities?: readonly string[] | null
  asksLogin?: boolean
  asksData?: boolean
  asksPayments?: boolean
}

export function resolveLaunchLane(input: ResolveLaunchLaneInput = {}): LaunchLane {
  const caps = (input.requiredCapabilities || []).map((c) => c.trim()).filter(Boolean)
  // Explicit [] = hosting-only. Any listed capability (auth/data/payments/…) is lane 2.
  if (caps.length > 0) return 'capability'
  if (input.asksLogin || input.asksData || input.asksPayments) return 'capability'
  return 'static'
}

/** True only when Launch must touch the hidden data engine (PocketBase today). */
export function launchRequiresDataEngine(input: ResolveLaunchLaneInput = {}): boolean {
  return resolveLaunchLane(input) === 'capability'
}

/** Landing / marketing / static website — never wait on a data engine. */
export function isStaticLaunchAppType(appType?: string | null): boolean {
  const kind = (appType || '').trim().toLowerCase()
  return kind === 'landing' || kind === 'static' || kind === 'website' || kind === 'marketing'
}
