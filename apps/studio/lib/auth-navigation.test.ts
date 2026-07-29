import { describe, expect, it } from 'vitest'

import { shouldDeferAuthRedirect } from './auth-navigation'

describe('shouldDeferAuthRedirect', () => {
  it('defers redirect when GoTrue has a session but context is still logged out', () => {
    expect(
      shouldDeferAuthRedirect({
        isLoggedIn: false,
        shouldRedirectToAuth: true,
        gotrueHasSession: true,
      })
    ).toBe(true)
  })

  it('allows redirect when there is no GoTrue session', () => {
    expect(
      shouldDeferAuthRedirect({
        isLoggedIn: false,
        shouldRedirectToAuth: true,
        gotrueHasSession: false,
      })
    ).toBe(false)
  })

  it('does not defer when React auth context is already logged in', () => {
    expect(
      shouldDeferAuthRedirect({
        isLoggedIn: true,
        shouldRedirectToAuth: false,
        gotrueHasSession: true,
      })
    ).toBe(false)
  })
})
