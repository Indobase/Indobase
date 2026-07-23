import { describe, expect, it } from 'vitest'

import { resolvePaymentsApiBaseUrl } from 'lib/api/saas/payments-mcp'

describe('payments-mcp helpers', () => {
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
})
