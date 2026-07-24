import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  buildPaymentsLaunchUrl,
  isPaymentsMerchantAdminRole,
  isPaymentsRole,
  isPaymentsRoleDeniedMessage,
  makePaymentsHandoffToken,
  PAYMENTS_ALLOWED_ROLES,
  PAYMENTS_ROLE_DENIED_CODE,
  paymentsTenantSlugForOrg,
  resolvePaymentsBaseUrl,
  sanitizePaymentsOrgSlug,
} from './payments-launch'

function decodeJwtPayload(token: string) {
  const [, payload] = token.split('.')
  return JSON.parse(Buffer.from(payload!, 'base64url').toString('utf8'))
}

describe('payments-launch', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('allows owner, admin, developer, and viewer for SSO', () => {
    expect(PAYMENTS_ALLOWED_ROLES).toEqual(['owner', 'admin', 'developer', 'viewer'])
    expect(isPaymentsRole('developer')).toBe(true)
    expect(isPaymentsRole('viewer')).toBe(true)
    expect(isPaymentsRole('member')).toBe(false)
    expect(isPaymentsMerchantAdminRole('admin')).toBe(true)
    expect(isPaymentsMerchantAdminRole('developer')).toBe(false)
  })

  it('maps Studio org slug to Payments tenant ib-{slug}', () => {
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

  it('prefers explicit payments base URL env', () => {
    vi.stubEnv('INDOBASE_PAYMENTS_URL', 'https://payments.indobase.in/')
    expect(resolvePaymentsBaseUrl()).toBe('https://payments.indobase.in')
  })

  it('builds launch URL with handoff token in the fragment', () => {
    expect(
      buildPaymentsLaunchUrl({
        baseUrl: 'https://payments.indobase.in',
        handoffToken: 'abc.def.ghi',
        projectRef: 'proj_123',
      })
    ).toBe(
      'https://payments.indobase.in/launch?project_ref=proj_123&from=studio#token=abc.def.ghi'
    )
  })

  it('signs the payments handoff token with role claim', () => {
    const secret = 'x'.repeat(32)
    const token = makePaymentsHandoffToken(
      {
        aud: 'indobase-payments',
        email: 'dev@example.com',
        exp: 9999999999,
        iat: 1,
        iss: 'https://studio.indobase.in',
        organization_name: 'acme',
        organization_slug: 'acme',
        project_name: 'Demo',
        project_ref: 'proj_123',
        role: 'developer',
        studio_url: 'https://studio.indobase.in',
        sub: 'user-1',
      },
      secret
    )
    expect(decodeJwtPayload(token).role).toBe('developer')
  })
})
