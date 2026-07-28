import { describe, expect, it, vi, beforeEach } from 'vitest'

import { getSaaSProjectServiceHealth, getSaaSEdgeFunctionsHealth } from './project-health'

vi.mock('./platform', () => ({
  getProject: vi.fn(),
  getGotrueUserId: vi.fn(() => 'user-1'),
}))

vi.mock('./query', () => ({
  executeQuery: vi.fn(),
}))

vi.mock('./util', () => ({
  decryptString: vi.fn((v: string) => v),
}))

const { getProject } = await import('./platform')
const { executeQuery } = await import('./query')

describe('project-health', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, status: 200 }) as Response)
    )
  })

  it('probes tenant stack when data plane timestamp is missing but services respond', async () => {
    vi.mocked(getProject).mockResolvedValue({
      restUrl: 'https://abc.indobase.in/rest/v1/',
    } as any)
    vi.mocked(executeQuery).mockResolvedValue({
      data: [
        {
          data_plane_last_provisioned_at: null,
          connection_string: 'postgres://tenant',
          connection_string_enc: null,
          status: 'ACTIVE_HEALTHY',
        },
      ],
      error: null,
    } as any)

    const health = await getSaaSProjectServiceHealth({
      claims: { sub: 'user-1' } as any,
      ref: 'abc',
    })

    expect(health?.every((s) => s.status === 'ACTIVE_HEALTHY')).toBe(true)
    expect(fetch).toHaveBeenCalled()
  })

  it('returns COMING_UP when dedicated tenant data plane is not provisioned', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 503 }) as Response)
    )
    vi.mocked(getProject).mockResolvedValue({
      restUrl: 'https://abc.indobase.in/rest/v1/',
    } as any)
    vi.mocked(executeQuery).mockResolvedValue({
      data: [
        {
          data_plane_last_provisioned_at: null,
          connection_string: 'postgres://tenant',
          connection_string_enc: null,
          status: 'ACTIVE_HEALTHY',
        },
      ],
      error: null,
    } as any)

    const health = await getSaaSProjectServiceHealth({
      claims: { sub: 'user-1' } as any,
      ref: 'abc',
    })

    expect(health?.every((s) => s.status === 'COMING_UP')).toBe(true)
  })

  it('probes tenant REST when data plane is provisioned', async () => {
    vi.mocked(getProject).mockResolvedValue({
      restUrl: 'https://abc.indobase.in/rest/v1/',
    } as any)
    vi.mocked(executeQuery).mockResolvedValue({
      data: [
        {
          data_plane_last_provisioned_at: '2026-01-01T00:00:00.000Z',
          connection_string: 'postgres://tenant',
          connection_string_enc: null,
          status: 'ACTIVE_HEALTHY',
        },
      ],
      error: null,
    } as any)

    const health = await getSaaSProjectServiceHealth({
      claims: { sub: 'user-1' } as any,
      ref: 'abc',
    })

    expect(health?.every((s) => s.status === 'ACTIVE_HEALTHY')).toBe(true)
    expect(fetch).toHaveBeenCalled()
  })

  it('falls back to public probes when internal split-VPS probes fail but provisioner reports healthy', async () => {
    process.env.DATA_PLANE_PROVISIONER_URL = 'https://provisioner.internal'
    process.env.DATA_PLANE_PROVISIONER_TOKEN = 'redacted-token'

    vi.mocked(getProject).mockResolvedValue({
      restUrl: 'https://abc.indobase.in/rest/v1/',
    } as any)
    vi.mocked(executeQuery).mockResolvedValue({
      data: [
        {
          data_plane_last_provisioned_at: '2026-01-01T00:00:00.000Z',
          data_plane_port_base: 15432,
          connection_string: 'postgres://tenant',
          connection_string_enc: null,
          status: 'ACTIVE_HEALTHY',
        },
      ],
      error: null,
    } as any)

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)
        if (url === 'https://provisioner.internal/stack-health') {
          return {
            ok: true,
            status: 200,
            json: async () => ({ ok: true }),
          } as Response
        }
        if (url.startsWith('http://172.17.0.1:')) {
          return { ok: false, status: 503 } as Response
        }
        return { ok: true, status: 200 } as Response
      })
    )

    const health = await getSaaSProjectServiceHealth({
      claims: { sub: 'user-1' } as any,
      ref: 'abc',
    })

    expect(health?.every((s) => s.status === 'ACTIVE_HEALTHY')).toBe(true)
    expect(fetch).toHaveBeenCalledWith(
      'https://provisioner.internal/stack-health',
      expect.objectContaining({ method: 'POST' })
    )
  })

  it('edge functions health probes tenant URL when data plane timestamp is missing', async () => {
    vi.mocked(getProject).mockResolvedValue({
      restUrl: 'https://abc.indobase.in/rest/v1/',
    } as any)
    vi.mocked(executeQuery).mockResolvedValue({
      data: [
        {
          data_plane_last_provisioned_at: null,
          connection_string: 'postgres://tenant',
          connection_string_enc: null,
          status: 'ACTIVE_HEALTHY',
        },
      ],
      error: null,
    } as any)

    const result = await getSaaSEdgeFunctionsHealth({
      claims: { sub: 'user-1' } as any,
      ref: 'abc',
    })

    expect(result).toEqual({ healthy: true })
  })
})
