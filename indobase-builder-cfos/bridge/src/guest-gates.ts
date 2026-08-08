/**
 * Guest vs signed-in access for Indobase OS bridge routes.
 * Guests may browse + read launch status; mutate paths require a real account.
 */

/** Paths that must reject Guest / draft_* (403 account_required). */
export const OS_ACCOUNT_REQUIRED_PATHS = [
  '/api/os/runtime/ensure',
  '/api/os/deploy/publish',
  '/api/os/launch',
  '/api/os/tools/launchBusiness',
  '/api/os/tools/goLive',
  '/api/os/domains/attach',
  '/api/os/usage/prompt-quota',
  '/api/os/auth/mail',
] as const

/** Read paths guests may call (session required, account not required). */
export const OS_GUEST_ALLOWED_READ_PATHS = [
  '/api/os/launch/status',
  '/api/session',
  '/api/os/runtime/agent-credentials',
  // Guests may begin-turn (no consume) so OTP signup chat is not blocked by the meter.
  '/api/os/agent/begin-turn',
] as const

export function pathRequiresSignedInAccount(pathname: string): boolean {
  const path = pathname.split('?')[0] || pathname
  return (OS_ACCOUNT_REQUIRED_PATHS as readonly string[]).includes(path)
}

export function pathAllowsGuestRead(pathname: string): boolean {
  const path = pathname.split('?')[0] || pathname
  return (OS_GUEST_ALLOWED_READ_PATHS as readonly string[]).includes(path)
}
