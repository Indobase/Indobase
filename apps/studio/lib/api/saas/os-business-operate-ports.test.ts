import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  createStudioBusinessOperatorPort,
  createStudioBusinessVerifyPort,
} from './os-business-operate-ports'

vi.mock('./platform', () => ({
  ensureSaasTables: vi.fn(),
  getGotrueUserId: vi.fn(() => 'user-1'),
}))

vi.mock('./query', () => ({
  executeQuery: vi.fn(),
}))

vi.mock('./os-launch-verify', async () => {
  const actual = await vi.importActual<typeof import('./os-launch-verify')>('./os-launch-verify')
  return {
    ...actual,
    verifyOsLaunch: vi.fn(),
    summarizeOsLaunchVerify: vi.fn((result: {
      passed: boolean
      verifiedAt: string
      liveUrl: string
      strictVerify?: boolean
      failures?: Array<{ id: string; message: string }>
      warnings?: Array<{ id: string; message: string }>
      checks?: Array<{ id: string; status: string; severity?: string }>
    }) => ({
      passed: result.passed,
      strict_verify: result.strictVerify ?? true,
      verified_at: result.verifiedAt,
      live_url: result.liveUrl,
      check_ids: (result.checks ?? []).map((c) => ({
        id: c.id,
        status: c.status,
        severity: c.severity ?? 'soft',
      })),
      failure_ids: (result.failures ?? []).map((f) => f.id),
      failure_messages: (result.failures ?? []).map((f) => f.message),
      warning_ids: (result.warnings ?? []).map((w) => w.id),
      warning_messages: (result.warnings ?? []).map((w) => w.message),
    })),
  }
})

vi.mock('./os-ai-operator', () => ({
  startOperator: vi.fn(),
}))

import { executeQuery } from './query'
import { verifyOsLaunch } from './os-launch-verify'
import { startOperator } from './os-ai-operator'

describe('createStudioBusinessVerifyPort', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('runs verifyOsLaunch, persists summary, returns ok with details', async () => {
    vi.mocked(verifyOsLaunch).mockResolvedValue({
      passed: true,
      strictVerify: true,
      verifiedAt: '2026-08-07T00:00:00.000Z',
      liveUrl: 'https://ws.example.com',
      checks: [
        {
          id: 'homepage',
          label: 'Homepage',
          status: 'passed',
          severity: 'hard',
          message: 'Your homepage is responding.',
        },
      ],
      failures: [],
      warnings: [],
    })
    vi.mocked(executeQuery).mockResolvedValue({
      data: [{ auth_config: { os_publish: { kind: 'artifact', publish_status: 'published' } } }],
      error: null,
    } as never)

    const port = createStudioBusinessVerifyPort({
      claims: { sub: 'user-1', email: 'a@example.com', role: 'authenticated' } as never,
    })
    const result = await port.verify({
      workspaceRef: 'ws_1',
      liveUrl: 'https://ws.example.com',
      requiredCapabilities: ['auth'],
    })

    expect(verifyOsLaunch).toHaveBeenCalledWith({
      liveUrl: 'https://ws.example.com',
      ensuredCapabilities: ['auth'],
      strictVerify: true,
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.details?.passed).toBe(true)
    }
    expect(executeQuery).toHaveBeenCalled()
  })

  it('hard-fails and stamps os_publish verify_failed when homepage unreachable', async () => {
    vi.mocked(verifyOsLaunch).mockResolvedValue({
      passed: false,
      strictVerify: true,
      verifiedAt: '2026-08-07T00:00:00.000Z',
      liveUrl: 'https://ws.example.com',
      checks: [
        {
          id: 'homepage',
          label: 'Homepage',
          status: 'failed',
          severity: 'hard',
          message: "We couldn't confirm your homepage is responding yet. Please try again in a moment.",
        },
      ],
      failures: [
        {
          id: 'homepage',
          label: 'Homepage',
          status: 'failed',
          severity: 'hard',
          message: "We couldn't confirm your homepage is responding yet. Please try again in a moment.",
        },
      ],
      warnings: [],
    })
    vi.mocked(executeQuery).mockResolvedValue({
      data: [{ auth_config: { os_publish: { kind: 'artifact', publish_status: 'published', live_url: 'https://ws.example.com' } } }],
      error: null,
    } as never)

    const port = createStudioBusinessVerifyPort({
      claims: { sub: 'user-1', email: 'a@example.com', role: 'authenticated' } as never,
    })
    const result = await port.verify({
      workspaceRef: 'ws_1',
      liveUrl: 'https://ws.example.com',
      strictVerify: true,
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.message).toMatch(/homepage|responding/i)
      expect(result.details?.publish_status).toBe('verify_failed')
      expect(result.details?.passed).toBe(false)
    }

    const stampCall = vi.mocked(executeQuery).mock.calls.find((call) => {
      const q = String(call[0]?.query ?? '')
      return q.includes("coalesce(p.auth_config->'os_publish'") || q.includes("coalesce(auth_config->'os_publish'")
    })
    expect(stampCall).toBeTruthy()
    const params = stampCall?.[0]?.parameters as unknown[]
    expect(String(params?.[1])).toContain('verify_failed')
  })

  it('hosting-only: softens strictVerify from os_publish.kind', async () => {
    vi.mocked(verifyOsLaunch).mockResolvedValue({
      passed: true,
      strictVerify: false,
      verifiedAt: '2026-08-07T00:00:00.000Z',
      liveUrl: 'https://ws.example.com',
      checks: [
        {
          id: 'homepage',
          label: 'Homepage',
          status: 'skipped',
          severity: 'soft',
          message: 'Homepage check skipped for hosting-only launch — your live link is reserved; content may still be empty.',
        },
      ],
      failures: [],
      warnings: [],
    })
    vi.mocked(executeQuery).mockResolvedValue({
      data: [{ auth_config: { os_publish: { kind: 'hosting-only', publish_status: 'published' } } }],
      error: null,
    } as never)

    const port = createStudioBusinessVerifyPort({
      claims: { sub: 'user-1', email: 'a@example.com', role: 'authenticated' } as never,
    })
    const result = await port.verify({
      workspaceRef: 'ws_1',
      liveUrl: 'https://ws.example.com',
    })

    expect(verifyOsLaunch).toHaveBeenCalledWith(
      expect.objectContaining({
        strictVerify: false,
      }),
    )
    expect(result.ok).toBe(true)
  })
})

describe('createStudioBusinessOperatorPort', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('starts operator and returns monitoring details', async () => {
    vi.mocked(executeQuery).mockResolvedValue({
      data: [{ auth_config: { os_launch_verify: { passed: true, verified_at: '2026-08-07T00:00:00.000Z' } } }],
      error: null,
    } as never)
    vi.mocked(startOperator).mockResolvedValue({
      ok: true,
      message: 'Operator is monitoring your business. Ran 3 checks (uptime, SEO, error signals).',
      session: {
        session_id: 'ops_1',
        workspace_ref: 'ws_1',
        live_url: 'https://ws.example.com',
        status: 'monitoring',
        phase: 'workforce',
        started_at: '2026-08-07T00:00:00.000Z',
        updated_at: '2026-08-07T00:00:00.000Z',
        last_run_at: '2026-08-07T00:00:00.000Z',
        jobs: [],
        next_suggestions: [],
        last_verify: { passed: true, verified_at: '2026-08-07T00:00:00.000Z' },
      },
    })

    const port = createStudioBusinessOperatorPort({
      claims: { sub: 'user-1', email: 'a@example.com', role: 'authenticated' } as never,
    })
    const result = await port.startOperator({
      workspaceRef: 'ws_1',
      liveUrl: 'https://ws.example.com',
    })

    expect(startOperator).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceRef: 'ws_1',
        liveUrl: 'https://ws.example.com',
        lastVerify: expect.objectContaining({ passed: true }),
      }),
    )
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.details?.status).toBe('monitoring')
      expect(result.details?.phase).toBe('workforce')
    }
  })
})
