import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  OS_AI_OPERATOR_PHASE,
  defaultOperatorSuggestions,
  getOperatorStatus,
  runPostPublishOperateHook,
  startOperator,
} from './os-ai-operator'
import { OPERATOR_JOB_UPTIME, type OperatorWorkforce } from './os-operator-workforce'

vi.mock('@indobase/platform', () => ({
  Platform: {
    events: {
      publish: vi.fn(),
      subscribe: vi.fn(),
    },
  },
}))

vi.mock('./platform', () => ({
  ensureSaasTables: vi.fn(),
}))

vi.mock('./query', () => ({
  executeQuery: vi.fn(),
}))

import { Platform } from '@indobase/platform'
import { executeQuery } from './query'

function mockWorkforce(overrides?: Partial<Awaited<ReturnType<OperatorWorkforce['runPass']>>>): OperatorWorkforce {
  return {
    runPass: vi.fn(async () => ({
      runId: 'arun_test',
      lastRunAt: '2026-08-07T02:00:00.000Z',
      jobs: [
        {
          id: 'astep_uptime',
          kind: OPERATOR_JOB_UPTIME,
          status: 'succeeded' as const,
          ran_at: '2026-08-07T02:00:00.000Z',
          summary: 'Your live site responded successfully.',
          findings: { ok: true },
        },
      ],
      suggestions: [
        {
          id: 'watch_conversions',
          title: 'Watch conversions',
          message: 'Track sign-ups, checkouts, and key actions once traffic starts.',
        },
      ],
      ...overrides,
    })),
  } as never
}

describe('os-ai-operator workforce', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('exposes workforce phase and default suggestions', () => {
    const suggestions = defaultOperatorSuggestions()
    expect(suggestions.map((s) => s.id)).toEqual([
      'watch_errors',
      'watch_conversions',
      'improve_seo',
    ])
    expect(OS_AI_OPERATOR_PHASE).toBe('workforce')
  })

  it('startOperator runs workforce, persists jobs, emits OperatorStarted', async () => {
    vi.mocked(executeQuery).mockResolvedValue({ data: [], error: null } as never)
    const workforce = mockWorkforce()

    const result = await startOperator({
      workspaceRef: 'ws_ops',
      liveUrl: 'https://ws_ops.indobase.in',
      gotrueId: 'user-1',
      workforce,
    })

    expect(result.ok).toBe(true)
    expect(result.session.status).toBe('monitoring')
    expect(result.session.phase).toBe('workforce')
    expect(result.session.last_run_at).toBe('2026-08-07T02:00:00.000Z')
    expect(result.session.jobs?.map((j) => j.kind)).toEqual([OPERATOR_JOB_UPTIME])
    expect(result.session.last_run_id).toBe('arun_test')
    expect(result.message).toMatch(/Ran 1 checks/i)
    expect(workforce.runPass).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceRef: 'ws_ops',
        liveUrl: 'https://ws_ops.indobase.in',
      }),
    )

    expect(executeQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        parameters: expect.arrayContaining([
          'ws_ops',
          expect.stringContaining('"phase":"workforce"'),
          'user-1',
        ]),
      }),
    )
    const persisted = JSON.parse(
      (vi.mocked(executeQuery).mock.calls[0][0] as { parameters: string[] }).parameters[1],
    )
    expect(persisted.jobs).toHaveLength(1)
    expect(persisted.last_run_at).toBe('2026-08-07T02:00:00.000Z')

    expect(Platform.events.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'OperatorStarted',
        projectRef: 'ws_ops',
        payload: expect.objectContaining({
          status: 'monitoring',
          phase: 'workforce',
        }),
      }),
    )
  })

  it('startOperator still returns session when persist fails', async () => {
    vi.mocked(executeQuery).mockResolvedValue({
      data: null,
      error: new Error('db down'),
    } as never)

    const result = await startOperator({
      workspaceRef: 'ws_ops',
      liveUrl: 'https://ws_ops.indobase.in',
      workforce: mockWorkforce(),
    })

    expect(result.ok).toBe(false)
    expect(result.session.status).toBe('monitoring')
    expect(result.session.phase).toBe('workforce')
    expect(Platform.events.publish).toHaveBeenCalled()
  })

  it('startOperator soft-fails when workforce throws', async () => {
    vi.mocked(executeQuery).mockResolvedValue({ data: [], error: null } as never)
    const workforce = {
      runPass: vi.fn(async () => {
        throw new Error('runtime boom')
      }),
    } as never

    const result = await startOperator({
      workspaceRef: 'ws_ops',
      liveUrl: 'https://ws_ops.indobase.in',
      workforce,
      persist: false,
    })

    expect(result.ok).toBe(true)
    expect(result.session.phase).toBe('workforce')
    expect(result.session.jobs).toEqual([])
    expect(result.session.next_suggestions.length).toBeGreaterThanOrEqual(1)
  })

  it('getOperatorStatus reads auth_config.os_operator', async () => {
    vi.mocked(executeQuery).mockResolvedValue({
      data: [
        {
          auth_config: {
            os_operator: {
              session_id: 'ops_ws_1',
              workspace_ref: 'ws_1',
              live_url: 'https://ws_1.indobase.in',
              status: 'monitoring',
              phase: 'workforce',
              started_at: '2026-08-07T00:00:00.000Z',
              updated_at: '2026-08-07T00:00:00.000Z',
              last_run_at: '2026-08-07T00:05:00.000Z',
              jobs: [],
              next_suggestions: [],
            },
          },
        },
      ],
      error: null,
    } as never)

    const status = await getOperatorStatus('ws_1')
    expect(status.ok).toBe(true)
    expect(status.session?.session_id).toBe('ops_ws_1')
    expect(status.message).toMatch(/workforce pass/i)
  })

  it('runPostPublishOperateHook verifies then starts operator', async () => {
    vi.mocked(executeQuery).mockResolvedValue({ data: [], error: null } as never)

    const verify = vi.fn(async () => ({
      passed: true,
      verifiedAt: '2026-08-07T01:00:00.000Z',
      failures: [] as Array<{ id: string }>,
      checks: [{ id: 'homepage', status: 'passed' }],
    }))

    const start = vi.fn(async (input: { workspaceRef: string; liveUrl: string }) => ({
      ok: true,
      session: {
        session_id: 'ops_x',
        workspace_ref: input.workspaceRef,
        live_url: input.liveUrl,
        status: 'monitoring' as const,
        phase: 'workforce' as const,
        started_at: '2026-08-07T01:00:00.000Z',
        updated_at: '2026-08-07T01:00:00.000Z',
        last_run_at: '2026-08-07T01:00:00.000Z',
        jobs: [],
        next_suggestions: defaultOperatorSuggestions(),
        last_verify: null,
      },
      message: 'ok',
    }))

    const result = await runPostPublishOperateHook({
      workspaceRef: 'ws_hook',
      liveUrl: 'https://ws_hook.indobase.in',
      gotrueId: 'u1',
      ensuredCapabilities: ['auth'],
      verify,
      start: start as never,
    })

    expect(verify).toHaveBeenCalledWith(
      expect.objectContaining({
        liveUrl: 'https://ws_hook.indobase.in',
        ensuredCapabilities: ['auth'],
      }),
    )
    expect(start).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceRef: 'ws_hook',
        lastVerify: expect.objectContaining({ passed: true }),
      }),
    )
    expect(result.operator?.ok).toBe(true)
    expect(result.verify?.passed).toBe(true)
  })
})
