import { beforeEach, describe, expect, it, vi } from 'vitest'

import { mintPaymentsMcpBearer, resolvePaymentsApiBaseUrl } from 'lib/api/saas/payments-mcp'

vi.mock('./platform', () => ({
  getGotrueUserId: vi.fn(() => 'user-1'),
  getPrimaryEmail: vi.fn(() => 'user@example.com'),
  getProject: vi.fn(),
}))

vi.mock('./payments-launch', () => ({
  getStudioOrigin: vi.fn(() => 'https://studio.indobase.in'),
  makePaymentsHandoffToken: vi.fn(() => 'signed-token'),
  resolvePaymentsBaseUrl: vi.fn(() => 'https://payments.indobase.in'),
  resolvePaymentsHandoffSecret: vi.fn(() => 'super-secret-payments-handoff-key-123456'),
  resolvePaymentsRole: vi.fn(),
}))

const { getProject } = await import('./platform')
const { resolvePaymentsRole } = await import('./payments-launch')

describe('payments-mcp helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    delete process.env.INDOBASE_PAYMENTS_API_KEY
  })

  it('defaults api host from payments web host', () => {
    const prevApi = process.env.INDOBASE_PAYMENTS_API_URL
    const prevPublicApi = process.env.NEXT_PUBLIC_INDOBASE_PAYMENTS_API_URL
    const prevWeb = process.env.INDOBASE_PAYMENTS_URL
    const prevPublicWeb = process.env.NEXT_PUBLIC_INDOBASE_PAYMENTS_URL

    delete process.env.INDOBASE_PAYMENTS_API_URL
    delete process.env.NEXT_PUBLIC_INDOBASE_PAYMENTS_API_URL
    process.env.INDOBASE_PAYMENTS_URL = 'https://payments.indobase.in'

    expect(resolvePaymentsApiBaseUrl()).toBe('https://api.payments.indobase.in')

    if (prevApi === undefined) delete process.env.INDOBASE_PAYMENTS_API_URL
    else process.env.INDOBASE_PAYMENTS_API_URL = prevApi
    if (prevPublicApi === undefined) delete process.env.NEXT_PUBLIC_INDOBASE_PAYMENTS_API_URL
    else process.env.NEXT_PUBLIC_INDOBASE_PAYMENTS_API_URL = prevPublicApi
    if (prevWeb === undefined) delete process.env.INDOBASE_PAYMENTS_URL
    else process.env.INDOBASE_PAYMENTS_URL = prevWeb
    if (prevPublicWeb === undefined) delete process.env.NEXT_PUBLIC_INDOBASE_PAYMENTS_URL
    else process.env.NEXT_PUBLIC_INDOBASE_PAYMENTS_URL = prevPublicWeb
  })

  it('prefers explicit API URL', () => {
    const prev = process.env.INDOBASE_PAYMENTS_API_URL
    process.env.INDOBASE_PAYMENTS_API_URL = 'https://api.payments.example.com/'
    expect(resolvePaymentsApiBaseUrl()).toBe('https://api.payments.example.com')
    if (prev === undefined) delete process.env.INDOBASE_PAYMENTS_API_URL
    else process.env.INDOBASE_PAYMENTS_API_URL = prev
  })

  it('always returns a scoped JWT bearer instead of the global API key fallback', async () => {
    process.env.INDOBASE_PAYMENTS_API_KEY = 'global-payments-key'
    vi.mocked(getProject).mockResolvedValue({
      ref: 'proj_123',
      name: 'Demo Project',
      organization_slug: 'demo-org',
    } as any)
    vi.mocked(resolvePaymentsRole).mockResolvedValue('developer')

    const result = await mintPaymentsMcpBearer({
      claims: { sub: 'user-1', email: 'user@example.com' } as any,
      projectRef: 'proj_123',
    })

    expect(result.bearerToken).toBe('signed-token')
    expect(result.organizationSlug).toBe('demo-org')
    expect(result.projectRef).toBe('proj_123')
  })
})
