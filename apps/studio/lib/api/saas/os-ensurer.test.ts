import { afterEach, describe, expect, it, vi } from 'vitest'

import { assertOsEnsureAccess } from './os-ensurer-access'
import { finalizeProductCapabilityEnsure } from './os-ensurer-product-setup'

vi.mock('./payments-launch', () => ({
  getPaymentsLaunchRedirect: vi.fn(),
}))

vi.mock('./email-launch', () => ({
  getEmailLaunchRedirect: vi.fn(),
}))

import { getPaymentsLaunchRedirect } from './payments-launch'
import { getEmailLaunchRedirect } from './email-launch'

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

  it('returns pending_setup + launch_url for commerce (never Payments are live)', async () => {
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
    expect(result.customerMessage).toMatch(/finish checkout setup/i)
    expect(result.customerMessage).not.toMatch(/Payments are live/i)
  })

  it('keeps pending_setup when payments handoff mint fails', async () => {
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
