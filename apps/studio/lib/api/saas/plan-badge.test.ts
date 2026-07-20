/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'

import { applyIndobaseBadgeToHtml, planHasBackendStudio, planRequiresIndobaseBadge } from './plan-badge'

describe('plan-badge', () => {
  it('injects badge for Free and strips for Basic+', () => {
    const html = '<!doctype html><html><body><h1>Hi</h1></body></html>'
    const withBadge = applyIndobaseBadgeToHtml(html, 'free')
    expect(withBadge).toContain('data-indobase-badge')
    expect(withBadge).toContain('Made with Indobase')

    const without = applyIndobaseBadgeToHtml(withBadge, 'basic')
    expect(without).not.toContain('data-indobase-badge')
  })

  it('reports badge / backend studio correctly', () => {
    expect(planRequiresIndobaseBadge('free')).toBe(true)
    expect(planRequiresIndobaseBadge('basic')).toBe(false)

    // Studio opens at Basic — this asserted `false` while the entitlement enforced `true`, and the
    // broken setup meant this file never ran, so the contradiction went unnoticed all the way onto
    // the pricing page ("No backend Studio (frontend only)" on a plan that had it).
    expect(planHasBackendStudio('free')).toBe(false)
    expect(planHasBackendStudio('basic')).toBe(true)
    expect(planHasBackendStudio('pro')).toBe(true)
  })
})
