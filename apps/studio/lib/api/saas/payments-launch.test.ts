import { afterEach, describe, expect, it, vi } from 'vitest'

import { buildStudioPaymentsHubUrl } from './payments-launch'
import {
  isPaymentsMerchantAdminRole,
  isPaymentsRole,
  isPaymentsRoleDeniedMessage,
  PAYMENTS_ALLOWED_ROLES,
  PAYMENTS_ROLE_DENIED_CODE,
  paymentsTenantSlugForOrg,
  sanitizePaymentsOrgSlug,
} from './payments-launch-shared'

describe('payments-launch', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('allows owner, admin, developer, and viewer for Payments hub access', () => {
    expect(PAYMENTS_ALLOWED_ROLES).toEqual(['owner', 'admin', 'developer', 'viewer'])
    expect(isPaymentsRole('developer')).toBe(true)
    expect(isPaymentsRole('viewer')).toBe(true)
    expect(isPaymentsRole('member')).toBe(false)
    expect(isPaymentsMerchantAdminRole('admin')).toBe(true)
    expect(isPaymentsMerchantAdminRole('developer')).toBe(false)
  })

  it('maps Studio org slug to legacy ib-{slug} tenant id (merchant profile)', () => {
    expect(sanitizePaymentsOrgSlug('Acme Corp')).toBe('ib-acme-corp')
    expect(paymentsTenantSlugForOrg('my_org')).toBe('ib-my-org')
    expect(sanitizePaymentsOrgSlug('---')).toBe('ib-org')
    expect(sanitizePaymentsOrgSlug('a'.repeat(50)).length).toBeLessThanOrEqual(43)
  })

  it('detects role-denied messages for Ask-an-admin UX', () => {
    expect(
      isPaymentsRoleDeniedMessage(
        'Ask an organization owner or admin to grant you Payments access'
      )
    ).toBe(true)
    expect(isPaymentsRoleDeniedMessage(PAYMENTS_ROLE_DENIED_CODE)).toBe(true)
    expect(isPaymentsRoleDeniedMessage('Project not found')).toBe(false)
  })

  it('builds Studio BYOK Payments hub URL (not payments.indobase.in)', () => {
    expect(buildStudioPaymentsHubUrl('proj_123', 'https://studio.indobase.in/')).toBe(
      'https://studio.indobase.in/project/proj_123/payments'
    )
    expect(buildStudioPaymentsHubUrl('proj_123', 'https://studio.indobase.in')).not.toContain(
      'payments.indobase'
    )
  })
})
