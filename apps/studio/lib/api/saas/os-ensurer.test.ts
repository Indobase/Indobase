import { afterEach, describe, expect, it, vi } from 'vitest'

import { assertOsEnsureAccess } from './os-ensurer-access'
import { finalizeProductCapabilityEnsure } from './os-ensurer-product-setup'

vi.mock('./payments-launch', () => ({
  getPaymentsLaunchRedirect: vi.fn(),
}))

vi.mock('./email-launch', () => ({
  getEmailLaunchRedirect: vi.fn(),
}))

vi.mock('./merchant-kyc', () => ({
  getMerchantCanGoLive: vi.fn(),
  getMerchantProfile: vi.fn(),
  patchMerchantProfile: vi.fn(),
}))

import { getPaymentsLaunchRedirect } from './payments-launch'
import { getEmailLaunchRedirect } from './email-launch'
import {
  getMerchantCanGoLive,
  getMerchantProfile,
  patchMerchantProfile,
} from './merchant-kyc'

describe('assertOsEnsureAccess', () => {
  it('rejects guest gotrue ids', () => {
    const result = assertOsEnsureAccess({
      gotrueId: 'guest_abc123',
      workspaceRef: 'acme-workspace',
      plan: 'pro',
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.code).toBe('account_required')
    expect(result.statusCode).toBe(403)
    expect(result.message).toMatch(/account/i)
  })

  it('rejects draft_* workspace refs', () => {
    const result = assertOsEnsureAccess({
      gotrueId: 'user-1',
      workspaceRef: 'draft_deadbeef',
      plan: 'pro',
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.code).toBe('account_required')
  })

  it('rejects Free plan without backendStudio', () => {
    const result = assertOsEnsureAccess({
      gotrueId: 'user-1',
      workspaceRef: 'acme-ws',
      plan: 'free',
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.code).toBe('plan_required')
    expect(result.statusCode).toBe(403)
  })

  it('allows Basic+ signed-in workspaces', () => {
    expect(
      assertOsEnsureAccess({ gotrueId: 'user-1', workspaceRef: 'acme-ws', plan: 'basic' }).ok,
    ).toBe(true)
    expect(
      assertOsEnsureAccess({ gotrueId: 'user-1', workspaceRef: 'acme-ws', plan: 'pro' }).ok,
    ).toBe(true)
    expect(
      assertOsEnsureAccess({ gotrueId: 'user-1', workspaceRef: 'acme-ws', plan: 'studio' }).ok,
    ).toBe(true)
  })

  it('treats missing plan as free (blocked)', () => {
    const result = assertOsEnsureAccess({
      gotrueId: 'user-1',
      workspaceRef: 'acme-ws',
      plan: null,
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.code).toBe('plan_required')
  })
})

describe('finalizeProductCapabilityEnsure', () => {
  const claims = { sub: 'user-1', email: 'a@b.com', role: 'authenticated' } as never

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('returns pending_setup + launch_url for commerce when KYC not verified', async () => {
    vi.mocked(getMerchantCanGoLive).mockResolvedValue(false)
    vi.mocked(getMerchantProfile).mockResolvedValue({
      settlement_market: 'international',
      settlement_adapter: 'stripe',
    } as never)
    vi.mocked(getPaymentsLaunchRedirect).mockResolvedValue({
      url: 'https://payments.indobase.in/launch#token=abc',
    } as never)

    const result = await finalizeProductCapabilityEnsure({
      claims,
      workspaceRef: 'ws_1',
      capabilityId: 'commerce',
    })

    expect(result.ok).toBe(true)
    expect(result.state).toBe('pending_setup')
    expect(result.setupStatus).toBe('pending')
    expect(result.launchUrl).toContain('payments.indobase.in')
    expect(result.customerMessage).toMatch(/paste API keys|Connect gateway|finish checkout setup/i)
    expect(result.customerMessage).not.toMatch(/Payments are live/i)
    expect(result.customerMessage).not.toMatch(/razorpay|stripe/i)
  })

  it('applies settlement_market india (Razorpay rail) when asked', async () => {
    vi.mocked(getMerchantCanGoLive).mockResolvedValue(false)
    vi.mocked(patchMerchantProfile).mockResolvedValue({
      settlement_market: 'india',
      settlement_adapter: 'razorpay_route',
    } as never)
    vi.mocked(getPaymentsLaunchRedirect).mockResolvedValue({
      url: 'https://payments.indobase.in/launch#token=abc',
    } as never)

    const result = await finalizeProductCapabilityEnsure({
      claims,
      workspaceRef: 'ws_1',
      capabilityId: 'commerce',
      settlementMarket: 'india',
    })

    expect(patchMerchantProfile).toHaveBeenCalledWith({
      claims,
      ref: 'ws_1',
      patch: { settlement_market: 'india' },
    })
    expect(result.settlementMarket).toBe('india')
    expect(result.settlementAdapter).toBe('razorpay_route')
    expect(result.customerMessage).toMatch(/India settlements selected/i)
    expect(result.customerMessage).not.toMatch(/razorpay|stripe/i)
  })

  it('returns ready + Payments are live when merchant KYC is verified', async () => {
    vi.mocked(getMerchantCanGoLive).mockResolvedValue(true)
    vi.mocked(getMerchantProfile).mockResolvedValue({
      settlement_market: 'international',
      settlement_adapter: 'stripe',
    } as never)
    vi.mocked(getPaymentsLaunchRedirect).mockResolvedValue({
      url: 'https://payments.indobase.in/launch#token=abc',
    } as never)

    const result = await finalizeProductCapabilityEnsure({
      claims,
      workspaceRef: 'ws_1',
      capabilityId: 'commerce',
    })

    expect(result.state).toBe('ready')
    expect(result.setupStatus).toBe('ready')
    expect(result.customerMessage).toMatch(/Payments are live/i)
    expect(result.launchUrl).toContain('payments.indobase.in')
  })

  it('keeps pending_setup when payments handoff mint fails and KYC not verified', async () => {
    vi.mocked(getMerchantCanGoLive).mockResolvedValue(false)
    vi.mocked(getMerchantProfile).mockResolvedValue({
      settlement_market: 'international',
      settlement_adapter: 'stripe',
    } as never)
    vi.mocked(getPaymentsLaunchRedirect).mockRejectedValue(new Error('secret missing'))

    const result = await finalizeProductCapabilityEnsure({
      claims,
      workspaceRef: 'ws_1',
      capabilityId: 'commerce',
    })

    expect(result.ok).toBe(true)
    expect(result.state).toBe('pending_setup')
    expect(result.launchUrl).toBeNull()
    expect(result.customerMessage).toMatch(/could not be linked/i)
    expect(result.customerMessage?.toLowerCase()).not.toMatch(/razorpay|stripe|secret/)
  })

  it('returns pending_setup + launch_url for email', async () => {
    vi.mocked(getEmailLaunchRedirect).mockResolvedValue({
      url: 'https://email.indobase.in/console/launch#token=xyz',
    } as never)

    const result = await finalizeProductCapabilityEnsure({
      claims,
      workspaceRef: 'ws_1',
      capabilityId: 'email',
    })

    expect(result.state).toBe('pending_setup')
    expect(result.customerMessage).toMatch(/finish sender setup/i)
    expect(result.launchUrl).toContain('email.indobase.in')
  })

  it('keeps auth / businessData as ready', async () => {
    const auth = await finalizeProductCapabilityEnsure({
      claims,
      workspaceRef: 'ws_1',
      capabilityId: 'auth',
    })
    expect(auth.state).toBe('ready')
    expect(auth.setupStatus).toBe('ready')

    const data = await finalizeProductCapabilityEnsure({
      claims,
      workspaceRef: 'ws_1',
      capabilityId: 'businessData',
    })
    expect(data.state).toBe('ready')
  })
})
