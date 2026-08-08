import { describe, expect, it, vi } from 'vitest'
import { createEventBus } from '../events'
import {
  EXECUTION_PUBLISH_PIPELINE,
  ExecutionPipelineStage,
  createExecutionPublisher,
  deploymentFailed,
  deploymentSucceeded,
  ExecutionOrchestrator,
  NotImplementedPipelineStageError,
  type BuildArtifactPort,
  type CapabilityEnsurePort,
  type DeploymentAdapter,
  type FreezeSnapshotPort,
  type MarkLivePort,
  type PublishPreflightPort,
} from './index'

function stubAdapter(overrides: Partial<DeploymentAdapter> = {}): DeploymentAdapter {
  return {
    prepare: vi.fn(),
    deploy: vi.fn().mockResolvedValue({ artifactRef: 'artifact://test' }),
    assignDomain: vi
      .fn()
      .mockResolvedValue({ liveUrl: 'https://proj_x.indobase.in' }),
    provisionTLS: vi.fn(),
    healthCheck: vi.fn().mockResolvedValue({ healthy: true }),
    rollback: vi.fn(),
    ...overrides,
  }
}

function stubPreflight(
  overrides: Partial<
    Extract<Awaited<ReturnType<PublishPreflightPort['validateWorkspace']>>, { ok: true }>
  > = {},
): PublishPreflightPort {
  return {
    validateWorkspace: vi.fn().mockResolvedValue({
      ok: true,
      projectRef: 'proj_x',
      provisionState: 'ready',
      hostDomain: 'indobase.in',
      provisionerConfigured: true,
      deployReady: true,
      ...overrides,
    }),
  }
}

function stubFreeze(
  overrides: Partial<Extract<Awaited<ReturnType<FreezeSnapshotPort['freezeSnapshot']>>, { ok: true }>> = {},
): FreezeSnapshotPort {
  return {
    freezeSnapshot: vi.fn().mockResolvedValue({
      ok: true,
      snapshot: {
        snapshotId: 'deploy_abc',
        deploymentId: 'abc',
        kind: 'artifact',
        contentHash: 'files:1:bytes:10:prefix:sites/abc',
        artifactRef: 'sites/abc',
      },
      ...overrides,
    }),
  }
}

describe('execution.publish pipeline (PR 3)', () => {
  it('defines canonical publish pipeline stage order', () => {
    expect(EXECUTION_PUBLISH_PIPELINE).toEqual([
      'ValidateWorkspace',
      'FreezeSnapshot',
      'Build',
      'CapabilityEnsure',
      'Deploy',
      'AssignDomain',
      'SSL',
      'HealthCheck',
      'MarkLive',
      'EmitEvents',
    ])
    expect(ExecutionPipelineStage.Deploy).toBe('Deploy')
  })

  it('builds success and failure deployment results', () => {
    const success = deploymentSucceeded({
      executionId: 'exec_test' as never,
      projectRef: 'proj_x',
      startedAt: '2026-08-07T00:00:00.000Z',
      finishedAt: '2026-08-07T00:00:01.000Z',
      liveUrl: 'https://proj_x.indobase.in',
      stage: ExecutionPipelineStage.EmitEvents,
      outputRef: 'artifact://build_1',
      publishStatus: 'published',
    })
    expect(success.outcome.ok).toBe(true)
    if (success.outcome.ok) {
      expect(success.outcome.liveUrl).toBe('https://proj_x.indobase.in')
      expect(success.outcome.publishStatus).toBe('published')
    }

    const failure = deploymentFailed({
      executionId: 'exec_test' as never,
      projectRef: 'proj_x',
      startedAt: '2026-08-07T00:00:00.000Z',
      stage: ExecutionPipelineStage.Deploy,
      errorCode: 'DEPLOY_FAILED',
      message: 'adapter rejected deploy',
    })
    expect(failure.outcome.ok).toBe(false)
    if (!failure.outcome.ok) {
      expect(failure.outcome.errorCode).toBe('DEPLOY_FAILED')
    }
  })

  it('orchestrator completes happy path with adapter, ports, and events', async () => {
    const adapter = stubAdapter()
    const preflight = stubPreflight()
    const freezeSnapshot = stubFreeze()
    const build: BuildArtifactPort = {
      build: vi.fn().mockResolvedValue({ ok: true, artifactRef: 'sites/abc', buildId: 'abc' }),
    }
    const markLive: MarkLivePort = { markLive: vi.fn() }
    const eventBus = createEventBus()
    const events: string[] = []
    eventBus.subscribe('*', (e) => events.push(e.type))

    const orchestrator = new ExecutionOrchestrator({
      adapter,
      preflight,
      freezeSnapshot,
      build,
      markLive,
      eventBus,
    })

    const result = await orchestrator.runPublishPipeline({
      projectRef: 'proj_x',
      reason: 'launch',
    })

    expect(result.outcome.ok).toBe(true)
    if (result.outcome.ok) {
      expect(result.outcome.liveUrl).toBe('https://proj_x.indobase.in')
      expect(result.outcome.publishStatus).toBe('published')
      expect(result.outcome.stage).toBe(ExecutionPipelineStage.EmitEvents)
      expect(result.outcome.outputRef).toBe('artifact://test')
    }
    expect(freezeSnapshot.freezeSnapshot).toHaveBeenCalledOnce()
    expect(build.build).toHaveBeenCalledOnce()
    expect(adapter.prepare).toHaveBeenCalledOnce()
    expect(adapter.deploy).toHaveBeenCalledOnce()
    expect(adapter.assignDomain).toHaveBeenCalledOnce()
    expect(adapter.provisionTLS).toHaveBeenCalledOnce()
    expect(adapter.healthCheck).toHaveBeenCalledOnce()
    expect(markLive.markLive).toHaveBeenCalledOnce()
    expect(events).toEqual(['DeploymentPublished', 'ExecutionFinished'])
    expect(result.executionId).toMatch(/^exec_/)
  })

  it('skips CapabilityEnsure when requiredCapabilities is empty', async () => {
    const capabilityEnsure: CapabilityEnsurePort = {
      ensureCapabilities: vi.fn(),
    }
    const orchestrator = new ExecutionOrchestrator({
      adapter: stubAdapter(),
      preflight: stubPreflight(),
      freezeSnapshot: stubFreeze(),
      capabilityEnsure,
      eventBus: createEventBus(),
    })

    const result = await orchestrator.runPublishPipeline({ projectRef: 'proj_x' })
    expect(result.outcome.ok).toBe(true)
    expect(capabilityEnsure.ensureCapabilities).not.toHaveBeenCalled()
  })

  it('ensures only listed requiredCapabilities', async () => {
    const capabilityEnsure: CapabilityEnsurePort = {
      ensureCapabilities: vi.fn().mockResolvedValue({ ok: true }),
    }
    const orchestrator = new ExecutionOrchestrator({
      adapter: stubAdapter(),
      preflight: stubPreflight(),
      freezeSnapshot: stubFreeze(),
      capabilityEnsure,
    })

    await orchestrator.runPublishPipeline({
      projectRef: 'proj_x',
      requiredCapabilities: ['auth'],
    })

    expect(capabilityEnsure.ensureCapabilities).toHaveBeenCalledWith(
      expect.objectContaining({
        projectRef: 'proj_x',
        capabilities: ['auth'],
      }),
    )
  })

  it('fails CapabilityEnsure with customer-safe message', async () => {
    const capabilityEnsure: CapabilityEnsurePort = {
      ensureCapabilities: vi.fn().mockResolvedValue({
        ok: false,
        message: 'We could not enable a required feature for your business yet. Please try again.',
      }),
    }
    const orchestrator = new ExecutionOrchestrator({
      adapter: stubAdapter(),
      preflight: stubPreflight(),
      freezeSnapshot: stubFreeze(),
      capabilityEnsure,
    })

    const result = await orchestrator.runPublishPipeline({
      projectRef: 'proj_x',
      requiredCapabilities: ['auth'],
    })

    expect(result.outcome.ok).toBe(false)
    if (!result.outcome.ok) {
      expect(result.outcome.stage).toBe(ExecutionPipelineStage.CapabilityEnsure)
      expect(result.outcome.errorCode).toBe('CAPABILITY_ENSURE_FAILED')
    }
  })

  it('orchestrator queues when deploy is not ready', async () => {
    const adapter = stubAdapter()
    const preflight = stubPreflight({
      provisionState: 'none',
      deployReady: false,
      queuedMessage: 'Launch queued — publish URL reserved.',
    })
    const orchestrator = new ExecutionOrchestrator({
      adapter,
      preflight,
      freezeSnapshot: stubFreeze({
        snapshot: {
          snapshotId: 'hosting_proj_x',
          kind: 'hosting-only',
          artifactRef: 'proj_x',
        },
      }),
    })

    const result = await orchestrator.runPublishPipeline({ projectRef: 'proj_x' })

    expect(result.outcome.ok).toBe(true)
    if (result.outcome.ok) {
      expect(result.outcome.publishStatus).toBe('queued')
      expect(result.outcome.message).toBe('Launch queued — publish URL reserved.')
    }
    expect(adapter.deploy).not.toHaveBeenCalled()
    expect(adapter.assignDomain).toHaveBeenCalledOnce()
    expect(adapter.healthCheck).not.toHaveBeenCalled()
  })

  it('orchestrator fails validation when workspace preflight rejects', async () => {
    const preflight: PublishPreflightPort = {
      validateWorkspace: vi.fn().mockResolvedValue({
        ok: false,
        message: 'Workspace not found',
      }),
    }
    const orchestrator = new ExecutionOrchestrator({
      adapter: stubAdapter(),
      preflight,
    })

    const result = await orchestrator.runPublishPipeline({ projectRef: 'missing' })

    expect(result.outcome.ok).toBe(false)
    if (!result.outcome.ok) {
      expect(result.outcome.stage).toBe(ExecutionPipelineStage.ValidateWorkspace)
      expect(result.outcome.errorCode).toBe('VALIDATION_FAILED')
      expect(result.outcome.message).toBe('Workspace not found')
    }
  })

  it('skips health probe for hosting-only freezes', async () => {
    const adapter = stubAdapter()
    const orchestrator = new ExecutionOrchestrator({
      adapter,
      preflight: stubPreflight(),
      freezeSnapshot: stubFreeze({
        snapshot: {
          snapshotId: 'hosting_proj_x',
          kind: 'hosting-only',
          artifactRef: 'proj_x',
        },
      }),
    })

    const result = await orchestrator.runPublishPipeline({ projectRef: 'proj_x' })
    expect(result.outcome.ok).toBe(true)
    expect(adapter.deploy).toHaveBeenCalledOnce()
    expect(adapter.healthCheck).not.toHaveBeenCalled()
  })

  it('rolls back after health check failure once deploy started', async () => {
    const adapter = stubAdapter({
      healthCheck: vi.fn().mockResolvedValue({
        healthy: false,
        details: {
          message: "We couldn't confirm your site is live yet. Please try again in a moment.",
        },
      }),
    })
    const orchestrator = new ExecutionOrchestrator({
      adapter,
      preflight: stubPreflight(),
      freezeSnapshot: stubFreeze(),
    })

    const result = await orchestrator.runPublishPipeline({ projectRef: 'proj_x' })

    expect(result.outcome.ok).toBe(false)
    if (!result.outcome.ok) {
      expect(result.outcome.stage).toBe(ExecutionPipelineStage.HealthCheck)
      expect(result.outcome.errorCode).toBe('HEALTH_CHECK_FAILED')
    }
    expect(adapter.deploy).toHaveBeenCalledOnce()
    expect(adapter.rollback).toHaveBeenCalledOnce()
  })

  it('rolls back after deploy failure', async () => {
    const adapter = stubAdapter({
      deploy: vi.fn().mockRejectedValue(new Error('Ensure site hosting failed (502)')),
    })
    const orchestrator = new ExecutionOrchestrator({
      adapter,
      preflight: stubPreflight(),
      freezeSnapshot: stubFreeze(),
    })

    const result = await orchestrator.runPublishPipeline({ projectRef: 'proj_x' })

    expect(result.outcome.ok).toBe(false)
    if (!result.outcome.ok) {
      expect(result.outcome.stage).toBe(ExecutionPipelineStage.Deploy)
      expect(result.outcome.errorCode).toBe('DEPLOY_FAILED')
      // Infra jargon sanitized for customers
      expect(result.outcome.message).not.toMatch(/502|provisioner|hosting failed/i)
    }
    expect(adapter.rollback).toHaveBeenCalledOnce()
  })

  it('fails Build when build port rejects', async () => {
    const adapter = stubAdapter()
    const build: BuildArtifactPort = {
      build: vi.fn().mockResolvedValue({
        ok: false,
        message: "Your site isn't ready to publish yet. Finish building, then try Launch again.",
      }),
    }
    const orchestrator = new ExecutionOrchestrator({
      adapter,
      preflight: stubPreflight(),
      freezeSnapshot: stubFreeze(),
      build,
    })

    const result = await orchestrator.runPublishPipeline({ projectRef: 'proj_x' })
    expect(result.outcome.ok).toBe(false)
    if (!result.outcome.ok) {
      expect(result.outcome.stage).toBe(ExecutionPipelineStage.Build)
      expect(result.outcome.errorCode).toBe('BUILD_FAILED')
    }
    expect(adapter.deploy).not.toHaveBeenCalled()
  })

  it('queues publish when Build returns structured queued', async () => {
    const adapter = stubAdapter()
    const markLive: MarkLivePort = { markLive: vi.fn() }
    const build: BuildArtifactPort = {
      build: vi.fn().mockResolvedValue({
        ok: true,
        status: 'queued',
        buildId: 'dep-building',
        artifactRef: 'sites/dep-building',
        message: 'Your site is still building. Launch will finish when the build is ready.',
      }),
    }
    const orchestrator = new ExecutionOrchestrator({
      adapter,
      preflight: stubPreflight(),
      freezeSnapshot: stubFreeze({
        snapshot: {
          snapshotId: 'hosting_proj_x',
          kind: 'hosting-only',
          artifactRef: 'proj_x',
          source: 'hosting_placeholder',
        },
      }),
      build,
      markLive,
    })

    const result = await orchestrator.runPublishPipeline({ projectRef: 'proj_x' })

    expect(result.outcome.ok).toBe(true)
    if (result.outcome.ok) {
      expect(result.outcome.publishStatus).toBe('queued')
      expect(result.outcome.message).toMatch(/still building/i)
    }
    expect(adapter.deploy).not.toHaveBeenCalled()
    expect(adapter.healthCheck).not.toHaveBeenCalled()
    expect(adapter.assignDomain).toHaveBeenCalledOnce()
    expect(markLive.markLive).toHaveBeenCalledWith(
      expect.objectContaining({
        publishStatus: 'queued',
        snapshot: expect.objectContaining({ deploymentId: 'dep-building' }),
      }),
    )
  })

  it('promotes freeze to artifact after Build promoteSnapshot', async () => {
    const adapter = stubAdapter()
    const build: BuildArtifactPort = {
      build: vi.fn().mockResolvedValue({
        ok: true,
        status: 'ready',
        artifactRef: 'sites/new',
        buildId: 'dep-new',
        promoteSnapshot: {
          snapshotId: 'deploy_dep-new',
          deploymentId: 'dep-new',
          kind: 'artifact',
          artifactRef: 'sites/new',
          contentHash: 'sha256:abc',
          source: 'ready_deployment',
        },
      }),
    }
    const orchestrator = new ExecutionOrchestrator({
      adapter,
      preflight: stubPreflight(),
      freezeSnapshot: stubFreeze({
        snapshot: {
          snapshotId: 'payload_abc',
          kind: 'artifact',
          contentHash: 'sha256:abc',
          source: 'payload_artifacts',
          artifactRef: 'proj_x',
        },
      }),
      build,
    })

    const result = await orchestrator.runPublishPipeline({ projectRef: 'proj_x' })
    expect(result.outcome.ok).toBe(true)
    expect(adapter.deploy).toHaveBeenCalledOnce()
    expect(adapter.healthCheck).toHaveBeenCalledOnce()
    const deployCtx = vi.mocked(adapter.deploy).mock.calls[0]?.[0]
    expect(deployCtx?.payload?.deploymentId).toBe('dep-new')
    expect(deployCtx?.payload?.frozenKind).toBe('artifact')
  })

  it('throws NotImplementedPipelineStageError for unknown stages', async () => {
    const orchestrator = new ExecutionOrchestrator({
      adapter: stubAdapter(),
      preflight: stubPreflight(),
    })
    await expect(
      orchestrator['runStage']('UnknownStage' as never, {
        projectRef: 'proj_x',
        executionId: 'exec_1' as never,
        startedAt: new Date().toISOString(),
        run: {},
      }),
    ).rejects.toBeInstanceOf(NotImplementedPipelineStageError)
  })

  it('execution publisher delegates to orchestrator', async () => {
    const publisher = createExecutionPublisher({
      adapter: stubAdapter(),
      preflight: stubPreflight(),
      freezeSnapshot: stubFreeze(),
    })
    const result = await publisher.publish({ projectRef: 'proj_y' })
    expect(result.projectRef).toBe('proj_y')
    expect(result.outcome.ok).toBe(true)
  })
})
