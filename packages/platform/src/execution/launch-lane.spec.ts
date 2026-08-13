import { describe, expect, it } from 'vitest'
import {
  isStaticLaunchAppType,
  launchRequiresDataEngine,
  resolveLaunchLane,
} from './launch-lane'

describe('launch lane (independent of PocketBase)', () => {
  it('defaults landing/static to execution.publish without a data engine', () => {
    expect(resolveLaunchLane({ appType: 'landing' })).toBe('static')
    expect(resolveLaunchLane({ appType: 'landing', requiredCapabilities: [] })).toBe('static')
    expect(launchRequiresDataEngine({ appType: 'landing', requiredCapabilities: [] })).toBe(
      false,
    )
    expect(isStaticLaunchAppType('landing')).toBe(true)
    expect(isStaticLaunchAppType('website')).toBe(true)
  })

  it('opens the capability lane only when login/data/payments are asked', () => {
    expect(launchRequiresDataEngine({ asksLogin: true })).toBe(true)
    expect(launchRequiresDataEngine({ asksData: true })).toBe(true)
    expect(launchRequiresDataEngine({ asksPayments: true })).toBe(true)
    expect(launchRequiresDataEngine({ requiredCapabilities: ['auth'] })).toBe(true)
    expect(resolveLaunchLane({ appType: 'ecommerce' })).toBe('static')
    expect(resolveLaunchLane({ appType: 'ecommerce', requiredCapabilities: ['catalog'] })).toBe(
      'capability',
    )
  })
})
