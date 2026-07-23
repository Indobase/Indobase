import { env } from '@/lib/env'

/**
 * Send operators to Studio sign-in. Payments has no password / signup UX —
 * Studio GoTrue is the only IdP (see `/launch` handoff).
 */
export function studioSignInUrl(opts?: {
  projectRef?: string | null
  returnUrl?: string | null
}): string {
  const studio = env.studioUrl.replace(/\/+$/, '')
  const returnPath =
    opts?.returnUrl && opts.returnUrl.startsWith('/')
      ? opts.returnUrl
      : opts?.projectRef
        ? `/project/${encodeURIComponent(opts.projectRef)}/payments`
        : '/'
  return `${studio}/sign-in?returnTo=${encodeURIComponent(returnPath)}`
}

export function redirectToStudioSignIn(opts?: {
  projectRef?: string | null
  returnUrl?: string | null
}): void {
  window.location.replace(studioSignInUrl(opts))
}
