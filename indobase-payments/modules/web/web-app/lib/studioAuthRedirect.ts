import { env } from '@/lib/env'

export const PAYMENTS_RETURN_URL_KEY = 'payments_return_url'

/**
 * Send operators to Studio sign-in. Payments has no password / signup UX —
 * Studio GoTrue is the only IdP (see `/launch` handoff).
 */
export function studioSignInUrl(opts?: {
  projectRef?: string | null
  returnUrl?: string | null
}): string {
  const studio = env.studioUrl.replace(/\/+$/, '')

  const paymentsReturn =
    opts?.returnUrl && opts.returnUrl.startsWith('/') ? opts.returnUrl : null

  if (paymentsReturn && typeof sessionStorage !== 'undefined') {
    sessionStorage.setItem(PAYMENTS_RETURN_URL_KEY, paymentsReturn)
  }

  const studioReturnPath = opts?.projectRef
    ? `/project/${encodeURIComponent(opts.projectRef)}/payments`
    : '/organizations'

  return `${studio}/sign-in?returnTo=${encodeURIComponent(studioReturnPath)}`
}

export function redirectToStudioSignIn(opts?: {
  projectRef?: string | null
  returnUrl?: string | null
}): void {
  window.location.replace(studioSignInUrl(opts))
}
