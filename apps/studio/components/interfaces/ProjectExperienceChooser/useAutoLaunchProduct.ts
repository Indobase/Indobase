import { useEffect, useRef, useState } from 'react'

/**
 * Opens a product surface automatically instead of making the user click through an interstitial.
 *
 * The naive version of this — launch on mount — traps the user: they open Analytics, press Back,
 * this page mounts again, and it immediately throws them back into Analytics. They can never
 * return to Studio. So a launch is recorded in sessionStorage and a second mount for the same
 * project shows the page instead of relaunching.
 *
 * Consequences of that design, all deliberate:
 *  - Back always lands on the interstitial, which then behaves as the product's home/setup page.
 *  - The setup content (tracking snippet, project↔site mapping) stays reachable rather than
 *    becoming a page nobody can open.
 *  - A failed launch never auto-retries. The caller's existing error UI renders and the user
 *    keeps a manual button, so a broken handoff degrades to today's behaviour rather than an
 *    invisible redirect loop.
 *
 * sessionStorage (not localStorage) is correct here: "have I already been sent to this product in
 * this tab" is tab-scoped, and a fresh tab should auto-open again.
 */

/** Bump if the semantics of the stored value ever change. */
const KEY_PREFIX = 'ib.autolaunch.v1'

function storageKey(product: string, projectRef: string): string {
  return `${KEY_PREFIX}.${product}.${projectRef}`
}

/** sessionStorage throws in some privacy modes — never let that break the page. */
function safeGet(key: string): string | null {
  try {
    return window.sessionStorage.getItem(key)
  } catch {
    return null
  }
}

function safeSet(key: string, value: string): void {
  try {
    window.sessionStorage.setItem(key, value)
  } catch {
    // Private mode / storage disabled. Falling through means we simply do not auto-launch
    // again, which is the safe direction: an extra click beats a redirect loop.
  }
}

export type UseAutoLaunchProductOptions = {
  /** Stable product id, e.g. 'analytics'. Namespaces the per-tab record. */
  product: string
  projectRef: string | undefined
  /** Resolves the handoff and navigates. Should reject/return falsy on failure. */
  launch: () => Promise<void>
  /**
   * Set false to opt out (feature flag, or a `?stay=1` deep link that should show setup instead
   * of bouncing the user onward).
   */
  enabled?: boolean
}

export type UseAutoLaunchProductResult = {
  /** True while the automatic open is in flight — render "Opening …" rather than the full page. */
  isAutoLaunching: boolean
  /** True once we have decided not to auto-launch, so the caller can show the normal page. */
  settled: boolean
}

export function useAutoLaunchProduct({
  product,
  projectRef,
  launch,
  enabled = true,
}: UseAutoLaunchProductOptions): UseAutoLaunchProductResult {
  const [isAutoLaunching, setIsAutoLaunching] = useState(false)
  const [settled, setSettled] = useState(false)

  // React 18 StrictMode double-invokes effects in development; without this guard the launch
  // would fire twice and mint two handoff tokens.
  const attempted = useRef(false)

  useEffect(() => {
    if (attempted.current) return
    if (!enabled || !projectRef || typeof window === 'undefined') {
      setSettled(true)
      return
    }

    const key = storageKey(product, projectRef)

    // Already sent onward in this tab — this mount is a Back navigation. Show the page.
    if (safeGet(key)) {
      attempted.current = true
      setSettled(true)
      return
    }

    attempted.current = true

    // Record BEFORE launching. If the navigation succeeds this component unmounts mid-flight, so
    // writing afterwards would never run and Back would relaunch — the exact trap being avoided.
    safeSet(key, String(Date.now()))
    setIsAutoLaunching(true)

    void launch()
      .catch(() => {
        // Swallow: the caller owns error presentation. We only stop showing "Opening…".
      })
      .finally(() => {
        setIsAutoLaunching(false)
        setSettled(true)
      })
  }, [enabled, launch, product, projectRef])

  return { isAutoLaunching, settled }
}

/**
 * Clears the per-tab record so the next visit auto-opens again. Call from an explicit "open"
 * button so a manual launch does not leave the tab permanently opted out.
 */
export function resetAutoLaunch(product: string, projectRef: string | undefined): void {
  if (!projectRef || typeof window === 'undefined') return
  try {
    window.sessionStorage.removeItem(storageKey(product, projectRef))
  } catch {
    // ignore
  }
}
