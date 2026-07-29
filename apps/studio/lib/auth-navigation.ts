import { auth } from 'lib/gotrue'

/** Yield so AuthProvider can apply onAuthStateChange before route guards run. */
export function waitForAuthContextFlush(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve())
    })
  })
}

/** After sign-in / verifyOtp, ensure GoTrue persisted a session before navigating. */
export async function waitForGotrueSession(maxAttempts = 20, delayMs = 25) {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const {
      data: { session },
    } = await auth.getSession()
    if (session?.user) return session
    await new Promise((resolve) => setTimeout(resolve, delayMs))
  }
  return null
}

export async function flushAuthBeforeNavigation(): Promise<void> {
  await waitForGotrueSession()
  await waitForAuthContextFlush()
}

/**
 * GoTrue may already have a session while React auth context is still stale (post sign-in).
 * Defer sign-in redirect until context catches up to avoid a blank /organizations shell.
 */
export function shouldDeferAuthRedirect({
  isLoggedIn,
  shouldRedirectToAuth,
  gotrueHasSession,
}: {
  isLoggedIn: boolean
  shouldRedirectToAuth: boolean
  gotrueHasSession: boolean
}) {
  if (!shouldRedirectToAuth || isLoggedIn) return false
  return gotrueHasSession
}
