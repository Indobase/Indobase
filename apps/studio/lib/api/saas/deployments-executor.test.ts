import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockEnsureSaasTables,
  mockExecuteQuery,
  mockGetGotrueUserId,
  mockGetProjectHostingForRef,
  mockRecordAuditLog,
  mockResolveBuilderHandoffSecret,
} = vi.hoisted(() => ({
  mockEnsureSaasTables: vi.fn(),
  mockExecuteQuery: vi.fn(),
  mockGetGotrueUserId: vi.fn(),
  mockGetProjectHostingForRef: vi.fn(),
  mockRecordAuditLog: vi.fn(),
  mockResolveBuilderHandoffSecret: vi.fn(() => 'runtime-secret'),
}))

vi.mock('./audit', () => ({
  recordAuditLog: mockRecordAuditLog,
}))

vi.mock('./builder-launch', () => ({
  resolveBuilderHandoffSecret: mockResolveBuilderHandoffSecret,
}))

vi.mock('./hosting', () => ({
  getProjectHostingForRef: mockGetProjectHostingForRef,
}))

vi.mock('./platform', () => ({
  ensureSaasTables: mockEnsureSaasTables,
  getGotrueUserId: mockGetGotrueUserId,
}))

vi.mock('./query', () => ({
  executeQuery: mockExecuteQuery,
}))

import {
  processNextProjectDeployment,
  processProjectDeploymentBatch,
  renewProjectDeploymentHeartbeat,
} from './deployments'

function buildRequestedDeploymentRow() {
  return {
    completed_at: null,
    custom_domain_hostname: null,
    id: '11111111-1111-1111-1111-111111111111',
    inserted_at: '2026-06-16T10:00:00.000Z',
    last_error: null,
    logs: [],
    metadata: {},
    project_ref: 'proj_123',
    requested_by_gotrue_id: '22222222-2222-2222-2222-222222222222',
    requested_via: 'studio' as const,
    status: 'requested' as const,
    target_url: 'https://app.indobase.in',
    updated_at: '2026-06-16T10:00:00.000Z',
  }
}

function buildBuildingDeploymentRow() {
  return {
    ...buildRequestedDeploymentRow(),
    metadata: {
      executor: {
        attempt_count: 1,
        claimed_at: '2026-06-16T10:00:00.000Z',
        heartbeat_at: '2026-06-16T10:00:00.000Z',
        last_attempted_at: '2026-06-16T10:00:00.000Z',
        lease_expires_at: '2026-06-16T10:15:00.000Z',
        processor: 'studio_internal_executor',
        worker_id: 'swarm-worker-1',
      },
    },
    status: 'building' as const,
    updated_at: '2026-06-16T10:00:00.000Z',
  }
}

function queueSuccessfulDeploymentProcessingMocks() {
  const requestedDeploymentRow = buildRequestedDeploymentRow()

  mockExecuteQuery
    .mockResolvedValueOnce({ data: [], error: undefined })
    .mockResolvedValueOnce({ data: [requestedDeploymentRow], error: undefined })
    .mockResolvedValueOnce({
      data: [
        {
          ...requestedDeploymentRow,
          logs: [
            {
              level: 'info',
              message: 'Deployment claimed by runtime executor',
              source: 'runtime',
              timestamp: '2026-06-16T10:00:01.000Z',
            },
          ],
          metadata: {
            deployment_health: null,
            executor: {
              attempt_count: 1,
              claimed_at: '2026-06-16T10:00:01.000Z',
              heartbeat_at: '2026-06-16T10:00:01.000Z',
              last_attempted_at: '2026-06-16T10:00:01.000Z',
              lease_expires_at: '2026-06-16T10:15:01.000Z',
              processor: 'studio_internal_executor',
              worker_id: 'studio_internal_executor',
            },
          },
          status: 'building',
          updated_at: '2026-06-16T10:00:01.000Z',
        },
      ],
      error: undefined,
    })
    .mockResolvedValueOnce({
      data: [
        {
          ...requestedDeploymentRow,
          logs: [
            {
              level: 'info',
              message: 'Deployment claimed by runtime executor',
              source: 'runtime',
              timestamp: '2026-06-16T10:00:01.000Z',
            },
          ],
          metadata: {
            deployment_health: null,
            executor: {
              attempt_count: 1,
              claimed_at: '2026-06-16T10:00:01.000Z',
              heartbeat_at: '2026-06-16T10:00:01.000Z',
              last_attempted_at: '2026-06-16T10:00:01.000Z',
              lease_expires_at: '2026-06-16T10:15:01.000Z',
              processor: 'studio_internal_executor',
              worker_id: 'studio_internal_executor',
            },
          },
          status: 'building',
          updated_at: '2026-06-16T10:00:01.000Z',
        },
      ],
      error: undefined,
    })
    .mockResolvedValueOnce({
      data: [
        {
          ...requestedDeploymentRow,
          completed_at: '2026-06-16T10:00:02.000Z',
          logs: [
            {
              level: 'info',
              message: 'Deployment claimed by runtime executor',
              source: 'runtime',
              timestamp: '2026-06-16T10:00:01.000Z',
            },
            {
              level: 'info',
              message: 'Deployment verified at https://app.indobase.in/',
              source: 'runtime',
              timestamp: '2026-06-16T10:00:02.000Z',
            },
          ],
          metadata: {
            deployment_health: {
              checked_at: '2026-06-16T10:00:02.000Z',
              duration_ms: 100,
              error: null,
              final_url: 'https://app.indobase.in/',
              method: 'HEAD',
              ok: true,
              status_code: 200,
            },
            executor: {
              attempt_count: 1,
              claimed_at: '2026-06-16T10:00:01.000Z',
              finished_at: '2026-06-16T10:00:02.000Z',
              heartbeat_at: '2026-06-16T10:00:02.000Z',
              last_attempted_at: '2026-06-16T10:00:01.000Z',
              last_succeeded_at: '2026-06-16T10:00:02.000Z',
              lease_expires_at: null,
              processor: 'studio_internal_executor',
              worker_id: 'studio_internal_executor',
            },
          },
          status: 'ready',
          updated_at: '2026-06-16T10:00:02.000Z',
        },
      ],
      error: undefined,
    })

  vi.mocked(fetch).mockResolvedValueOnce(
    new Response(null, {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    })
  )
}

describe('deployment executor', () => {
  beforeEach(() => {
    mockEnsureSaasTables.mockResolvedValue(undefined)
    mockRecordAuditLog.mockResolvedValue(undefined)
    mockGetProjectHostingForRef.mockResolvedValue(null)
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('returns idle when no queued deployment exists', async () => {
    mockExecuteQuery
      .mockResolvedValueOnce({ data: [], error: undefined })
      .mockResolvedValueOnce({ data: [], error: undefined })

    await expect(processNextProjectDeployment()).resolves.toEqual({
      deployment: null,
      health: null,
      outcome: 'idle',
    })
  })

  it('claims and verifies the next queued deployment', async () => {
    queueSuccessfulDeploymentProcessingMocks()

    const result = await processNextProjectDeployment()

    expect(result.outcome).toBe('ready')
    expect(result.deployment?.status).toBe('ready')
    expect(result.health?.ok).toBe(true)
    expect(mockRecordAuditLog).toHaveBeenCalledTimes(1)

    const claimCall = mockExecuteQuery.mock.calls[2]?.[0]
    expect(JSON.parse(claimCall.parameters[2] as string)).toMatchObject({
      executor: {
        attempt_count: 1,
        heartbeat_at: expect.any(String),
        last_attempted_at: expect.any(String),
        lease_expires_at: expect.any(String),
        worker_id: 'studio_internal_executor',
      },
    })

    const finalUpdateCall = mockExecuteQuery.mock.calls[4]?.[0]
    expect(finalUpdateCall.parameters[2]).toBe('ready')
    expect(JSON.parse(finalUpdateCall.parameters[4] as string)).toMatchObject({
      deployment_health: {
        ok: true,
        status_code: 200,
      },
      executor: {
        lease_expires_at: null,
        processor: 'studio_internal_executor',
        worker_id: 'studio_internal_executor',
      },
    })
  })

  it('recovers a stale building deployment before claiming new work', async () => {
    vi.stubEnv('PROJECT_DEPLOYMENT_STALE_AFTER_MS', '300000')

    const staleDeploymentRow = {
      ...buildRequestedDeploymentRow(),
      metadata: {
        executor: {
          attempt_count: 2,
          attempt_error_count: 1,
          heartbeat_at: '2026-06-16T09:40:00.000Z',
          last_attempted_at: '2026-06-16T09:40:00.000Z',
          lease_expires_at: '2026-06-16T09:45:00.000Z',
          worker_id: 'old-worker',
        },
      },
      status: 'building' as const,
      updated_at: '2026-06-16T09:40:00.000Z',
    }

    mockExecuteQuery
      .mockResolvedValueOnce({ data: [staleDeploymentRow], error: undefined })
      .mockResolvedValueOnce({
        data: [
          {
            ...staleDeploymentRow,
            completed_at: '2026-06-16T10:00:00.000Z',
            last_error: 'Recovered stale deployment after 5 minute timeout',
            logs: [
              {
                level: 'error',
                message: 'Recovered stale deployment after 5 minute timeout',
                source: 'runtime',
                timestamp: '2026-06-16T10:00:00.000Z',
              },
            ],
            metadata: {
              executor: {
                attempt_count: 2,
                attempt_error_count: 2,
                heartbeat_at: '2026-06-16T10:00:00.000Z',
                last_attempted_at: '2026-06-16T09:40:00.000Z',
                last_error_at: '2026-06-16T10:00:00.000Z',
                lease_expires_at: null,
                processor: 'studio_internal_executor',
                recovery_count: 1,
                recovery_reason: 'stale_build_timeout',
                stale_recovered_at: '2026-06-16T10:00:00.000Z',
                worker_id: 'swarm-worker-1',
              },
            },
            status: 'failed',
          },
        ],
        error: undefined,
      })

    const result = await processNextProjectDeployment({ workerId: 'swarm-worker-1' })

    expect(result.outcome).toBe('failed')
    expect(result.health).toBeNull()
    expect(result.deployment?.status).toBe('failed')
    expect(mockRecordAuditLog).toHaveBeenCalledTimes(1)

    const staleLookupCall = mockExecuteQuery.mock.calls[0]?.[0]
    expect(staleLookupCall.parameters).toHaveLength(2)

    const recoverCall = mockExecuteQuery.mock.calls[1]?.[0]
    expect(recoverCall.parameters[4]).toBe('Recovered stale deployment after 5 minute timeout')
    expect(JSON.parse(recoverCall.parameters[2] as string)).toMatchObject({
      executor: {
        attempt_error_count: 2,
        lease_expires_at: null,
        recovery_count: 1,
        recovery_reason: 'stale_build_timeout',
        worker_id: 'swarm-worker-1',
      },
    })
  })

  it('processes multiple queued deployments until the queue becomes idle', async () => {
    queueSuccessfulDeploymentProcessingMocks()
    mockExecuteQuery
      .mockResolvedValueOnce({ data: [], error: undefined })
      .mockResolvedValueOnce({ data: [], error: undefined })

    const result = await processProjectDeploymentBatch({ limit: 3 })

    expect(result).toMatchObject({
      failed: 0,
      idle: true,
      processed: 1,
      ready: 1,
    })
    expect(result.results).toHaveLength(2)
    expect(result.results[0]?.outcome).toBe('ready')
    expect(result.results[1]?.outcome).toBe('idle')
  })

  it('renews a heartbeat lease for the active worker on a building deployment', async () => {
    const buildingDeploymentRow = buildBuildingDeploymentRow()

    mockExecuteQuery
      .mockResolvedValueOnce({ data: [buildingDeploymentRow], error: undefined })
      .mockResolvedValueOnce({ data: [buildingDeploymentRow], error: undefined })
      .mockResolvedValueOnce({
        data: [
          {
            ...buildingDeploymentRow,
            metadata: {
              executor: {
                ...buildingDeploymentRow.metadata.executor,
                heartbeat_at: '2026-06-16T10:05:00.000Z',
                lease_expires_at: '2026-06-16T10:20:00.000Z',
                worker_id: 'swarm-worker-1',
              },
            },
            updated_at: '2026-06-16T10:05:00.000Z',
          },
        ],
        error: undefined,
      })

    const deployment = await renewProjectDeploymentHeartbeat({
      deploymentId: buildingDeploymentRow.id,
      ref: buildingDeploymentRow.project_ref,
      workerId: 'swarm-worker-1',
    })

    expect(deployment.status).toBe('building')
    expect(mockRecordAuditLog).toHaveBeenCalledTimes(1)

    const heartbeatUpdateCall = mockExecuteQuery.mock.calls[2]?.[0]
    expect(heartbeatUpdateCall.parameters[2]).toBe('building')
    expect(JSON.parse(heartbeatUpdateCall.parameters[4] as string)).toMatchObject({
      executor: {
        heartbeat_at: expect.any(String),
        lease_expires_at: expect.any(String),
        worker_id: 'swarm-worker-1',
      },
    })
  })

  it('rejects heartbeat renewal from a different worker', async () => {
    const buildingDeploymentRow = buildBuildingDeploymentRow()
    mockExecuteQuery.mockResolvedValueOnce({ data: [buildingDeploymentRow], error: undefined })

    await expect(
      renewProjectDeploymentHeartbeat({
        deploymentId: buildingDeploymentRow.id,
        ref: buildingDeploymentRow.project_ref,
        workerId: 'swarm-worker-2',
      })
    ).rejects.toThrow('Deployment heartbeat worker does not match the active lease owner')
  })
})
