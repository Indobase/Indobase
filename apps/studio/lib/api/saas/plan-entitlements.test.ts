import { describe, expect, it } from 'vitest'

import {
  assertFeatureAllowed,
  getPlanChangeType,
  getPlanEntitlements,
  isPaidCheckoutPlan,
  planRank,
} from './plan-entitlements'

describe('plan-entitlements', () => {
  it('maps Free → Basic as access: Studio opens at Basic, Free apps still run a backend', () => {
    const free = getPlanEntitlements('free')
    const basic = getPlanEntitlements('basic')

    expect(free.maxApps).toBe(1)
    expect(free.customDomain).toBe(false)
    expect(free.showIndobaseBadge).toBe(true)
    // Free apps run on a real backend, but the owner cannot open Studio.
    expect(free.backendStudio).toBe(false)
    expect(free.buildsPerDay).toBe(20)
    expect(free.idleSleepDays).toBe(7)
    expect(free.priceInr).toBe(0)
    // Free has a real backend, so its database must be bounded.
    expect(free.databaseBytes).toBe(500 * 1024 ** 2)

    expect(basic.maxApps).toBe(3)
    expect(basic.customDomain).toBe(true)
    expect(basic.showIndobaseBadge).toBe(false)
    expect(basic.backendStudio).toBe(true)
    expect(basic.buildsPerDay).toBe(50)
    expect(basic.databaseBytes).toBe(1024 ** 3)
    /*
     * Basic sleeps after 30 quiet days. Always-on for every Basic tenant is not affordable — each
     * app is a full multi-container stack, which caps the host at roughly 15 Basic customers.
     */
    expect(basic.idleSleepDays).toBe(30)
    expect(basic.priceInr).toBe(499)
  })

  it('gives Pro headroom with a real fair-use build ceiling (never unlimited)', () => {
    const pro = getPlanEntitlements('pro')
    expect(pro.backendStudio).toBe(true)
    expect(pro.maxApps).toBe(5)
    // AI generation is the dominant variable cost — an uncapped tier is unbounded spend.
    expect(pro.buildsPerDay).toBe(150)
    expect(pro.githubExport).toBe(true)
    expect(pro.databaseBytes).toBe(8 * 1024 ** 3)
    expect(pro.priceInr).toBe(1999)
  })

  it('adds seats and priority at Studio (team motive)', () => {
    const studio = getPlanEntitlements('studio')
    expect(studio.maxSeats).toBe(3)
    expect(studio.maxApps).toBe(15)
    expect(studio.priorityBuildQueue).toBe(true)
    expect(studio.sharedBilling).toBe(true)
    expect(studio.buildsPerDay).toBe(300)
    expect(studio.databaseBytes).toBe(20 * 1024 ** 3)
    expect(studio.priceInr).toBe(6999)

    // Legacy team rows inherit Studio entitlements
    expect(getPlanEntitlements('team').maxApps).toBe(15)
  })

  it('orders upgrades Free < Basic < Pro < Studio', () => {
    expect(planRank('free')).toBeLessThan(planRank('basic'))
    expect(planRank('basic')).toBeLessThan(planRank('pro'))
    expect(planRank('pro')).toBeLessThan(planRank('studio'))
    expect(getPlanChangeType('free', 'basic')).toBe('upgrade')
    expect(getPlanChangeType('pro', 'basic')).toBe('downgrade')
  })

  it('gates custom domain and backend studio with upgrade hints', () => {
    expect(assertFeatureAllowed('free', 'customDomain').ok).toBe(false)
    expect(assertFeatureAllowed('basic', 'customDomain').ok).toBe(true)
    expect(assertFeatureAllowed('free', 'backendStudio').ok).toBe(false)
    expect(assertFeatureAllowed('basic', 'backendStudio').ok).toBe(true)
    expect(assertFeatureAllowed('pro', 'backendStudio').ok).toBe(true)
  })

  it('marks Basic/Pro/Studio as Razorpay checkout plans', () => {
    expect(isPaidCheckoutPlan('free')).toBe(false)
    expect(isPaidCheckoutPlan('basic')).toBe(true)
    expect(isPaidCheckoutPlan('pro')).toBe(true)
    expect(isPaidCheckoutPlan('studio')).toBe(true)
    expect(isPaidCheckoutPlan('enterprise')).toBe(false)
  })
})
