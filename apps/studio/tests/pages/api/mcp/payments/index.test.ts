import { describe, expect, it, vi, beforeEach } from 'vitest'
import { createMocks } from 'node-mocks-http'

vi.mock('@modelcontextprotocol/sdk/server/streamableHttp.js', () => ({
  StreamableHTTPServerTransport: vi.fn().mockImplementation(() => ({
    handleRequest: vi.fn().mockResolvedValue(undefined),
  })),
}))

vi.mock('@modelcontextprotocol/sdk/server/mcp.js', () => ({
  McpServer: vi.fn().mockImplementation(() => ({
    connect: vi.fn().mockResolvedValue(undefined),
    registerTool: vi.fn(),
  })),
}))

vi.mock('lib/api/saas/payments-mcp-byok-server', () => ({
  createByokPaymentsMcpServer: vi.fn().mockReturnValue({
    connect: vi.fn().mockResolvedValue(undefined),
  }),
}))

vi.mock('lib/api/saas/builder-mcp-auth', async () => {
  const actual = await vi.importActual<typeof import('lib/api/saas/builder-mcp-auth')>(
    'lib/api/saas/builder-mcp-auth'
  )
  return {
    ...actual,
    verifyBuilderMcpToken: vi.fn(() => {
      throw new Error('not a builder token')
    }),
  }
})

vi.mock('lib/gotrue', () => ({
  getUserClaims: vi.fn().mockResolvedValue({
    claims: {
      sub: 'user-1',
      email: 'owner@example.com',
      role: 'authenticated',
    },
    error: null,
  }),
}))

import handler from '../../../../../pages/api/mcp/payments/index'
import { createByokPaymentsMcpServer } from 'lib/api/saas/payments-mcp-byok-server'

describe('/api/mcp/payments', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 405 for non-POST', async () => {
    const { req, res } = createMocks({ method: 'GET' })
    await handler(req as any, res as any)
    expect(res._getStatusCode()).toBe(405)
  })

  it('returns 401 without auth', async () => {
    const { req, res } = createMocks({
      method: 'POST',
      query: { project_ref: 'proj_123' },
      body: {},
    })
    await handler(req as any, res as any)
    expect(res._getStatusCode()).toBe(401)
  })

  it('accepts POST with Bearer + project_ref via BYOK MCP', async () => {
    const { req, res } = createMocks({
      method: 'POST',
      query: { project_ref: 'proj_123' },
      headers: { authorization: 'Bearer user-jwt' },
      body: {},
    })
    await handler(req as any, res as any)
    expect(createByokPaymentsMcpServer).toHaveBeenCalled()
    expect(res._getStatusCode()).not.toBe(401)
    expect(res._getStatusCode()).not.toBe(405)
  })
})
