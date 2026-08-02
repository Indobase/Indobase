import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockEnsureSaasTables,
  mockExecuteQuery,
  mockGetGotrueUserId,
  mockPublishDiscussEvent,
  mockRecordAuditLog,
  mockResolveBuilderHandoffSecret,
} = vi.hoisted(() => ({
  mockEnsureSaasTables: vi.fn(),
  mockExecuteQuery: vi.fn(),
  mockGetGotrueUserId: vi.fn(),
  mockPublishDiscussEvent: vi.fn(async () => ({
    published: false,
    messageId: null,
    reason: 'no_activity_channel' as const,
  })),
  mockRecordAuditLog: vi.fn(),
  mockResolveBuilderHandoffSecret: vi.fn(() => 'runtime-secret'),
}))

vi.mock('./audit', () => ({
  recordAuditLog: mockRecordAuditLog,
}))

// Best-effort side effect like recordAuditLog: mocked out so the Activity-channel publish does
// not consume responses from this suite's scripted executeQuery queue.
vi.mock('./discuss-events', () => ({
  publishDiscussEvent: mockPublishDiscussEvent,
}))

vi.mock('./builder-launch', () => ({
  resolveBuilderHandoffSecret: mockResolveBuilderHandoffSecret,
}))

vi.mock('./platform', () => ({
  ensureSaasTables: mockEnsureSaasTables,
  getGotrueUserId: mockGetGotrueUserId,
}))

vi.mock('./query', () => ({
  executeQuery: mockExecuteQuery,
}))

import {
  createProjectMobileBuild,
  processNextProjectMobileBuild,
  processProjectMobileBuildBatch,
  renewProjectMobileBuildHeartbeat,
} from './mobile-builds'

function buildRequestedMobileBuildRow() {
  return {
    completed_at: null,
    framework: 'expo' as const,
    id: '11111111-1111-1111-1111-111111111111',
    inserted_at: '2026-06-16T10:00:00.000Z',
    last_error: null,
    logs: [],
    metadata: {
      android_package_name: 'com.indobase.demo',
      version_code: 1,
      version_name: '1.0.0',
    },
    priority: 'priority' as const,
    profile: 'production' as const,
    project_ref: 'proj_123',
    requested_by_gotrue_id: '22222222-2222-2222-2222-222222222222',
    requested_via: 'studio' as const,
    status: 'requested' as const,
    target: 'android_aab' as const,
    updated_at: '2026-06-16T10:00:00.000Z',
  }
}

function buildBuildingMobileBuildRow() {
  return {
    ...buildRequestedMobileBuildRow(),
    metadata: {
      ...buildRequestedMobileBuildRow().metadata,
      executor: {
        attempt_count: 1,
        claimed_at: '2026-06-16T10:00:00.000Z',
        heartbeat_at: '2026-06-16T10:00:00.000Z',
        last_attempted_at: '2026-06-16T10:00:00.000Z',
        lease_expires_at: '2026-06-16T10:30:00.000Z',
        processor: 'studio_mobile_build_executor',
        worker_id: 'swarm-worker-1',
      },
    },
    status: 'building' as const,
    updated_at: '2026-06-16T10:00:00.000Z',
  }
}

function queueSuccessfulMobileBuildClaimMocks() {
  const requestedBuildRow = buildRequestedMobileBuildRow()

  mockExecuteQuery
    .mockResolvedValueOnce({ data: [], error: undefined })
    .mockResolvedValueOnce({
      data: [
        {
          ...requestedBuildRow,
          organization_id: 10,
          organization_plan: 'team',
        },
      ],
      error: undefined,
    })
    .mockResolvedValueOnce({
      data: [
        {
          ...requestedBuildRow,
          logs: [
            {
              level: 'info',
              message: 'Mobile build claimed by runtime executor (priority priority)',
              source: 'runtime',
              timestamp: '2026-06-16T10:00:01.000Z',
            },
          ],
          metadata: {
            ...requestedBuildRow.metadata,
            organization_plan: 'team',
            priority: 'priority',
            queue_limits: {
              org_concurrent_limit: 10,
              org_outstanding_limit: 25,
            },
            executor: {
              attempt_count: 1,
              claimed_at: '2026-06-16T10:00:01.000Z',
              heartbeat_at: '2026-06-16T10:00:01.000Z',
              last_attempted_at: '2026-06-16T10:00:01.000Z',
              lease_expires_at: '2026-06-16T10:30:01.000Z',
              processor: 'studio_mobile_build_executor',
              worker_id: 'studio_mobile_build_executor',
            },
          },
          status: 'building',
          updated_at: '2026-06-16T10:00:01.000Z',
        },
      ],
      error: undefined,
    })
    .mockResolvedValueOnce({ data: [], error: undefined })
}

describe('mobile build executor', () => {
  beforeEach(() => {
    mockEnsureSaasTables.mockResolvedValue(undefined)
    mockGetGotrueUserId.mockReturnValue('22222222-2222-2222-2222-222222222222')
    mockRecordAuditLog.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.clearAllMocks()
  })

  it('returns idle when no queued mobile build exists', async () => {
    mockExecuteQuery
      .mockResolvedValueOnce({ data: [], error: undefined })
      .mockResolvedValueOnce({ data: [], error: undefined })

    await expect(processNextProjectMobileBuild()).resolves.toEqual({
      build: null,
      outcome: 'idle',
    })
  })

  it('claims the next queued mobile build for the runtime worker', async () => {
    queueSuccessfulMobileBuildClaimMocks()

    const result = await processNextProjectMobileBuild()

    expect(result.outcome).toBe('claimed')
    expect(result.build?.status).toBe('building')
    expect(result.build?.artifacts).toEqual([])

    const claimCall = mockExecuteQuery.mock.calls[2]?.[0]
    expect(JSON.parse(claimCall.parameters[2] as string)).toMatchObject({
      organization_plan: 'team',
      priority: 'priority',
      queue_limits: {
        org_concurrent_limit: 10,
        org_outstanding_limit: 25,
      },
      executor: {
        attempt_count: 1,
        heartbeat_at: expect.any(String),
        last_attempted_at: expect.any(String),
        lease_expires_at: expect.any(String),
        worker_id: 'studio_mobile_build_executor',
      },
    })
    expect(claimCall.parameters[3]).toBe(10)
    expect(claimCall.parameters[4]).toBe(10)
  })

  it('recovers a stale building mobile build before claiming new work', async () => {
    vi.stubEnv('PROJECT_MOBILE_BUILD_STALE_AFTER_MS', '300000')

    const staleBuildRow = {
      ...buildRequestedMobileBuildRow(),
      metadata: {
        ...buildRequestedMobileBuildRow().metadata,
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
      .mockResolvedValueOnce({ data: [staleBuildRow], error: undefined })
      .mockResolvedValueOnce({
        data: [
          {
            ...staleBuildRow,
            completed_at: '2026-06-16T10:00:00.000Z',
            last_error: 'Recovered stale mobile build after 5 minute timeout',
            logs: [
              {
                level: 'error',
                message: 'Recovered stale mobile build after 5 minute timeout',
                source: 'runtime',
                timestamp: '2026-06-16T10:00:00.000Z',
              },
            ],
            metadata: {
              ...staleBuildRow.metadata,
              executor: {
                ...staleBuildRow.metadata.executor,
                attempt_error_count: 2,
                heartbeat_at: '2026-06-16T10:00:00.000Z',
                last_error_at: '2026-06-16T10:00:00.000Z',
                lease_expires_at: null,
                processor: 'studio_mobile_build_executor',
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
      .mockResolvedValueOnce({
        data: [
          {
            ...staleBuildRow,
            completed_at: '2026-06-16T10:00:00.000Z',
            last_error: 'Recovered stale mobile build after 5 minute timeout',
            logs: [
              {
                level: 'error',
                message: 'Recovered stale mobile build after 5 minute timeout',
                source: 'runtime',
                timestamp: '2026-06-16T10:00:00.000Z',
              },
            ],
            metadata: {
              ...staleBuildRow.metadata,
              executor: {
                ...staleBuildRow.metadata.executor,
                attempt_error_count: 2,
                heartbeat_at: '2026-06-16T10:00:00.000Z',
                last_error_at: '2026-06-16T10:00:00.000Z',
                lease_expires_at: null,
                processor: 'studio_mobile_build_executor',
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
      .mockResolvedValueOnce({ data: [], error: undefined })

    const result = await processNextProjectMobileBuild({ workerId: 'swarm-worker-1' })

    expect(result.outcome).toBe('failed')
    expect(result.build?.status).toBe('failed')
    expect(mockRecordAuditLog).toHaveBeenCalledTimes(1)

    const recoverCall = mockExecuteQuery.mock.calls[1]?.[0]
    expect(recoverCall.parameters[4]).toBe('Recovered stale mobile build after 5 minute timeout')
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

  it('processes multiple queued mobile builds until the queue becomes idle', async () => {
    queueSuccessfulMobileBuildClaimMocks()
    mockExecuteQuery
      .mockResolvedValueOnce({ data: [], error: undefined })
      .mockResolvedValueOnce({ data: [], error: undefined })

    const result = await processProjectMobileBuildBatch({ limit: 3 })

    expect(result).toMatchObject({
      claimed: 1,
      failed: 0,
      idle: true,
      processed: 1,
    })
    expect(result.results).toHaveLength(2)
    expect(result.results[0]?.outcome).toBe('claimed')
    expect(result.results[1]?.outcome).toBe('idle')
  })

  it('renews a heartbeat lease for the active worker on a building mobile build', async () => {
    const buildingBuildRow = buildBuildingMobileBuildRow()

    mockExecuteQuery
      .mockResolvedValueOnce({ data: [buildingBuildRow], error: undefined })
      .mockResolvedValueOnce({ data: [buildingBuildRow], error: undefined })
      .mockResolvedValueOnce({
        data: [
          {
            ...buildingBuildRow,
            metadata: {
              ...buildingBuildRow.metadata,
              executor: {
                ...buildingBuildRow.metadata.executor,
                heartbeat_at: '2026-06-16T10:05:00.000Z',
                lease_expires_at: '2026-06-16T10:35:00.000Z',
                worker_id: 'swarm-worker-1',
              },
            },
            updated_at: '2026-06-16T10:05:00.000Z',
          },
        ],
        error: undefined,
      })
      .mockResolvedValueOnce({
        data: [
          {
            ...buildingBuildRow,
            metadata: {
              ...buildingBuildRow.metadata,
              executor: {
                ...buildingBuildRow.metadata.executor,
                heartbeat_at: '2026-06-16T10:05:00.000Z',
                lease_expires_at: '2026-06-16T10:35:00.000Z',
                worker_id: 'swarm-worker-1',
              },
            },
            updated_at: '2026-06-16T10:05:00.000Z',
          },
        ],
        error: undefined,
      })
      .mockResolvedValueOnce({ data: [], error: undefined })

    const build = await renewProjectMobileBuildHeartbeat({
      buildId: buildingBuildRow.id,
      ref: buildingBuildRow.project_ref,
      workerId: 'swarm-worker-1',
    })

    expect(build.status).toBe('building')
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
    const buildingBuildRow = buildBuildingMobileBuildRow()
    mockExecuteQuery.mockResolvedValueOnce({ data: [buildingBuildRow], error: undefined })

    await expect(
      renewProjectMobileBuildHeartbeat({
        buildId: buildingBuildRow.id,
        ref: buildingBuildRow.project_ref,
        workerId: 'swarm-worker-2',
      })
    ).rejects.toThrow('Mobile build heartbeat worker does not match the active lease owner')
  })

  it('rejects new mobile build requests when an organization exceeds its plan queue limit', async () => {
    vi.stubEnv('PROJECT_MOBILE_BUILD_FREE_MAX_OUTSTANDING_PER_ORG', '2')

    mockExecuteQuery
      .mockResolvedValueOnce({
        data: [
          {
            organization_id: 42,
            organization_plan: 'free',
            project_id: '7',
          },
        ],
        error: undefined,
      })
      .mockResolvedValueOnce({
        data: [
          {
            building_count: '1',
            outstanding_count: '2',
            requested_count: '1',
          },
        ],
        error: undefined,
      })

    await expect(
      createProjectMobileBuild({
        claims: { sub: '22222222-2222-2222-2222-222222222222' } as unknown as Parameters<
          typeof createProjectMobileBuild
        >[0]['claims'],
        ref: 'proj_123',
      })
    ).rejects.toThrow(
      'This organization already has 2 active mobile build requests. The current free plan allows 2 queued or running Android builds at once.'
    )
  })
})
