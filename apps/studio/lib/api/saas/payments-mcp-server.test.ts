import { beforeEach, describe, expect, it, vi } from 'vitest'

const registerTool = vi.fn()

vi.mock('@modelcontextprotocol/sdk/server/mcp.js', () => ({
  McpServer: vi.fn().mockImplementation(() => ({
    registerTool,
    connect: vi.fn(),
  })),
}))

import { createPaymentsMcpServer } from './payments-mcp-server'

describe('createPaymentsMcpServer', () => {
  beforeEach(() => {
    registerTool.mockClear()
  })

  it('registers checkout and portal tools when writable', () => {
    createPaymentsMcpServer(
      { apiBaseUrl: 'https://api.example.com', request: vi.fn() },
      { liveChargesAllowed: true }
    )
    const names = registerTool.mock.calls.map((call) => call[0])
    expect(names).toEqual(
      expect.arrayContaining([
        'create_checkout_session',
        'create_portal_token',
        'list_checkout_sessions',
        'get_checkout_session',
        'create_subscription',
        'connect_india_settlements',
        'connect_international_cards',
        'list_payment_connectors',
      ])
    )
  })

  it('omits write tools when readOnly', () => {
    createPaymentsMcpServer(
      { apiBaseUrl: 'https://api.example.com', request: vi.fn() },
      { readOnly: true }
    )
    const names = registerTool.mock.calls.map((call) => call[0])
    expect(names).not.toContain('create_checkout_session')
    expect(names).not.toContain('create_portal_token')
    expect(names).toContain('list_checkout_sessions')
  })

  it('create_checkout_session refuses when KYC not verified', async () => {
    const request = vi.fn()
    createPaymentsMcpServer(
      { apiBaseUrl: 'https://api.example.com', request },
      { liveChargesAllowed: false }
    )
    const checkoutCall = registerTool.mock.calls.find((call) => call[0] === 'create_checkout_session')
    expect(checkoutCall).toBeTruthy()
    const handler = checkoutCall![2] as (args: Record<string, unknown>) => Promise<{
      isError?: boolean
      content: Array<{ text: string }>
    }>
    const result = await handler({
      customer_id: 'cust_1',
      plan_version_id: 'pv_1',
    })
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toMatch(/not verified/i)
    expect(request).not.toHaveBeenCalled()
  })

  it('create_checkout_session posts when KYC verified', async () => {
    const request = vi.fn().mockResolvedValue({
      session: { checkout_url: 'https://payments.example.com/checkout?token=abc' },
    })
    createPaymentsMcpServer(
      { apiBaseUrl: 'https://api.example.com', request },
      { liveChargesAllowed: true }
    )
    const checkoutCall = registerTool.mock.calls.find((call) => call[0] === 'create_checkout_session')
    const handler = checkoutCall![2] as (args: Record<string, unknown>) => Promise<unknown>
    await handler({ customer_id: 'cust_1', plan_version_id: 'pv_1' })
    expect(request).toHaveBeenCalledWith(
      'POST',
      '/api/v1/checkout-sessions',
      expect.objectContaining({
        body: expect.objectContaining({
          customer_id: 'cust_1',
          plan_version_id: 'pv_1',
        }),
      })
    )
  })
})
