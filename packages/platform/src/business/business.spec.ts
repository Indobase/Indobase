/**
 * business.launch unit tests — mock ExecutionPublisher; stub Plan/Configure/Verify/Operator.
 */
import { describe, expect, it, vi } from 'vitest'
import { createEventBus } from '../events'
import {
  BUSINESS_LAUNCH_PIPELINE,
  BUSINESS_LIVE_MESSAGE,
  BUSINESS_QUEUED_MESSAGE,
  BusinessLaunchStage,
  businessLaunchFailed,
  businessLaunchSucceeded,
  createBusinessLauncher,
  createNoopBusinessLaunchPorts,
  toOsLaunchResponse,
  type BusinessConfigurePort,
  type BusinessOperatorPort,
  type BusinessPlannerPort,
  type BusinessVerifyPort,
  type ExecutionPublisher,
} from '../index'

function stubExecutionPublisher(
  outcome: Awaited<ReturnType<ExecutionPublisher['publish']>>['outcome'],
  executionId = 'exec_biz_1',
): ExecutionPublisher {
  return {
    publish: vi.fn().mockResolvedValue({
      executionId,
      projectRef: 'ws_ref',
      startedAt: '2026-08-07T00:00:00.000Z',
      finishedAt: '2026-08-07T00:00:01.000Z',
      outcome,
    }),
  }
}

describe('business.launch pipeline (PR1+PR2)', () => {
  it('defines canonical business.launch stage order', () => {
    expect(BUSINESS_LAUNCH_PIPELINE).toEqual([
      'Plan',
      'EnsureCapabilities',
      'Publish',
      'ConfigureBusiness',
      'Verify',
      'StartOperator',
      'MarkBusinessLive',
      'EmitEvents',
    ])
    expect(BusinessLaunchStage.Publish).toBe('Publish')
  })

  it('builds customer-safe success and failure results', () => {
    const live = businessLaunchSucceeded({
      liveUrl: 'https://ws_ref.indobase.in',
      status: 'live',
      stage: BusinessLaunchStage.EmitEvents,
      executionId: 'exec_1',
    })
    expect(live.ok).toBe(true)
    expect(live.message).toBe(BUSINESS_LIVE_MESSAGE)
    expect(toOsLaunchResponse(live)).toEqual({
      ok: true,
      url: 'https://ws_ref.indobase.in',
      status: 'published',
      message: BUSINESS_LIVE_MESSAGE,
    })

    const failed = businessLaunchFailed({
      stage: BusinessLaunchStage.Publish,
      errorCode: 'PUBLISH_FAILED',
    })
    expect(failed.ok).toBe(false)
    expect(toOsLaunchResponse(failed).status).toBe('failed')
  })

  it('launch() calls execution.publish and returns live business result', async () => {
    const executionPublisher = stubExecutionPublisher({
      ok: true,
      liveUrl: 'https://ws_ref.indobase.in',
      stage: 'EmitEvents' as never,
      publishStatus: 'published',
    })

    const launcher = createBusinessLauncher({ executionPublisher })
    const result = await launcher.launch({
      workspaceRef: 'ws_ref',
      reason: 'os_launch',
      requiredCapabilities: ['auth'],
    })

    expect(executionPublisher.publish).toHaveBeenCalledWith({
      projectRef: 'ws_ref',
      reason: 'os_launch',
      requiredCapabilities: ['auth'],
      payload: undefined,
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.status).toBe('live')
      expect(result.liveUrl).toBe('https://ws_ref.indobase.in')
      expect(result.message).toBe(BUSINESS_LIVE_MESSAGE)
    }
  })

  it('maps queued publish to business queued language', async () => {
    const executionPublisher = stubExecutionPublisher({
      ok: true,
      liveUrl: 'https://ws_ref.indobase.in',
      stage: 'EmitEvents' as never,
      publishStatus: 'queued',
      message: 'Launch queued — publish URL reserved.',
    })

    const launcher = createBusinessLauncher({ executionPublisher })
    const result = await launcher.launch({ workspaceRef: 'ws_ref' })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.status).toBe('queued')
      expect(result.message).toBe('Launch queued — publish URL reserved.')
      expect(toOsLaunchResponse(result).status).toBe('queued')
    }
  })

  it('uses default queued message when publish omits one', async () => {
    const executionPublisher = stubExecutionPublisher({
      ok: true,
      liveUrl: 'https://ws_ref.indobase.in',
      stage: 'EmitEvents' as never,
      publishStatus: 'queued',
    })

    const launcher = createBusinessLauncher({ executionPublisher })
    const result = await launcher.launch({ workspaceRef: 'ws_ref' })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.message).toBe(BUSINESS_QUEUED_MESSAGE)
    }
  })

  it('surfaces publish failures without infra jargon', async () => {
    const executionPublisher = stubExecutionPublisher({
      ok: false,
      stage: 'Deploy' as never,
      errorCode: 'DEPLOY_FAILED',
      message: 'We could not publish your business right now. Please try again.',
    })

    const launcher = createBusinessLauncher({ executionPublisher })
    const result = await launcher.launch({ workspaceRef: 'ws_ref' })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.stage).toBe(BusinessLaunchStage.Publish)
      expect(result.errorCode).toBe('PUBLISH_FAILED')
      expect(result.message).not.toMatch(/docker|traefik|provisioner|coolify/i)
    }
  })

  it('applies planner requiredCapabilities when omitted on launch input', async () => {
    const executionPublisher = stubExecutionPublisher({
      ok: true,
      liveUrl: 'https://ws_ref.indobase.in',
      stage: 'EmitEvents' as never,
      publishStatus: 'published',
    })
    const planner: BusinessPlannerPort = {
      plan: vi.fn().mockResolvedValue({
        ok: true,
        plan: {
          requiredCapabilities: ['auth', 'payments'],
          reasons: {
            auth: 'Your app includes sign-in or account features.',
            payments: 'Your app includes checkout or payment features.',
          },
          readinessNotes: ['Launch will enable: auth, payments.'],
          source: 'auto',
        },
      }),
    }

    const launcher = createBusinessLauncher({ executionPublisher, planner })
    await launcher.launch({ workspaceRef: 'ws_ref' })

    expect(executionPublisher.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        projectRef: 'ws_ref',
        requiredCapabilities: ['auth', 'payments'],
        payload: expect.objectContaining({
          launch_planner: expect.objectContaining({
            requiredCapabilities: ['auth', 'payments'],
            source: 'auto',
          }),
        }),
      }),
    )
  })

  it('does not overwrite explicit empty requiredCapabilities (hosting-only)', async () => {
    const executionPublisher = stubExecutionPublisher({
      ok: true,
      liveUrl: 'https://ws_ref.indobase.in',
      stage: 'EmitEvents' as never,
      publishStatus: 'published',
    })
    const planner: BusinessPlannerPort = {
      plan: vi.fn().mockResolvedValue({
        ok: true,
        plan: {
          requiredCapabilities: ['auth'],
          source: 'auto',
        },
      }),
    }

    const launcher = createBusinessLauncher({ executionPublisher, planner })
    await launcher.launch({ workspaceRef: 'ws_ref', requiredCapabilities: [] })

    expect(executionPublisher.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        requiredCapabilities: [],
      }),
    )
  })

  it('stops when planner port fails before publish', async () => {
    const executionPublisher = stubExecutionPublisher({
      ok: true,
      liveUrl: 'https://ws_ref.indobase.in',
      stage: 'EmitEvents' as never,
      publishStatus: 'published',
    })
    const planner: BusinessPlannerPort = {
      plan: vi.fn().mockResolvedValue({ ok: false, message: 'Need a clearer business goal first.' }),
    }

    const launcher = createBusinessLauncher({ executionPublisher, planner })
    const result = await launcher.launch({ workspaceRef: 'ws_ref' })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.stage).toBe(BusinessLaunchStage.Plan)
      expect(result.errorCode).toBe('PLAN_FAILED')
    }
    expect(executionPublisher.publish).not.toHaveBeenCalled()
  })

  it('invokes configure / verify / operator after successful publish', async () => {
    const executionPublisher = stubExecutionPublisher({
      ok: true,
      liveUrl: 'https://ws_ref.indobase.in',
      stage: 'EmitEvents' as never,
      publishStatus: 'published',
    })
    const configure: BusinessConfigurePort = {
      configure: vi.fn().mockResolvedValue({ ok: true }),
    }
    const verify: BusinessVerifyPort = {
      verify: vi.fn().mockResolvedValue({ ok: true }),
    }
    const operator: BusinessOperatorPort = {
      startOperator: vi.fn().mockResolvedValue({ ok: true }),
    }

    const launcher = createBusinessLauncher({
      executionPublisher,
      configure,
      verify,
      operator,
    })
    await launcher.launch({ workspaceRef: 'ws_ref', requiredCapabilities: ['auth'] })

    expect(configure.configure).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceRef: 'ws_ref',
        liveUrl: 'https://ws_ref.indobase.in',
        requiredCapabilities: ['auth'],
      }),
    )
    expect(verify.verify).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceRef: 'ws_ref',
        liveUrl: 'https://ws_ref.indobase.in',
        requiredCapabilities: ['auth'],
      }),
    )
    expect(operator.startOperator).toHaveBeenCalledOnce()
  })

  it('keeps Launch live when configure port reports failure (best-effort Configure)', async () => {
    const executionPublisher = stubExecutionPublisher({
      ok: true,
      liveUrl: 'https://ws_ref.indobase.in',
      stage: 'EmitEvents' as never,
      publishStatus: 'published',
    })
    const configure: BusinessConfigurePort = {
      configure: vi.fn().mockResolvedValue({
        ok: false,
        message: "We couldn't finish business setup notes yet.",
      }),
    }
    const verify: BusinessVerifyPort = {
      verify: vi.fn().mockResolvedValue({ ok: true }),
    }
    const operator: BusinessOperatorPort = {
      startOperator: vi.fn().mockResolvedValue({ ok: true }),
    }

    const launcher = createBusinessLauncher({
      executionPublisher,
      configure,
      verify,
      operator,
    })
    const result = await launcher.launch({ workspaceRef: 'ws_ref' })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.status).toBe('live')
      expect(result.liveUrl).toBe('https://ws_ref.indobase.in')
    }
    expect(configure.configure).toHaveBeenCalledOnce()
    expect(verify.verify).toHaveBeenCalledOnce()
    expect(operator.startOperator).toHaveBeenCalledOnce()
  })

  it('keeps Launch live when operator port reports failure (best-effort Operator)', async () => {
    const executionPublisher = stubExecutionPublisher({
      ok: true,
      liveUrl: 'https://ws_ref.indobase.in',
      stage: 'EmitEvents' as never,
      publishStatus: 'published',
    })
    const operator: BusinessOperatorPort = {
      startOperator: vi.fn().mockResolvedValue({
        ok: false,
        message: 'Operator could not start yet.',
      }),
    }

    const launcher = createBusinessLauncher({
      executionPublisher,
      operator,
    })
    const result = await launcher.launch({ workspaceRef: 'ws_ref' })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.status).toBe('live')
    }
    expect(operator.startOperator).toHaveBeenCalledOnce()
  })

  it('hard-fails Launch when verify port reports hard failure (VERIFY_FAILED)', async () => {
    const executionPublisher = stubExecutionPublisher({
      ok: true,
      liveUrl: 'https://ws_ref.indobase.in',
      stage: 'EmitEvents' as never,
      publishStatus: 'published',
    })
    const verify: BusinessVerifyPort = {
      verify: vi.fn().mockResolvedValue({
        ok: false,
        message: "We couldn't confirm your homepage is responding yet.",
        details: { passed: false, failure_ids: ['homepage'], publish_status: 'verify_failed' },
      }),
    }
    const operator: BusinessOperatorPort = {
      startOperator: vi.fn().mockResolvedValue({ ok: true }),
    }

    const launcher = createBusinessLauncher({
      executionPublisher,
      verify,
      operator,
    })
    const result = await launcher.launch({ workspaceRef: 'ws_ref', strictVerify: true })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.stage).toBe(BusinessLaunchStage.Verify)
      expect(result.errorCode).toBe('VERIFY_FAILED')
      expect(result.liveUrl).toBe('https://ws_ref.indobase.in')
      expect(result.message).not.toMatch(/docker|traefik|provisioner/i)
      expect(toOsLaunchResponse(result)).toEqual({
        ok: false,
        status: 'failed',
        message: result.message,
        url: 'https://ws_ref.indobase.in',
      })
    }
    expect(verify.verify).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceRef: 'ws_ref',
        liveUrl: 'https://ws_ref.indobase.in',
        strictVerify: true,
      }),
    )
    expect(operator.startOperator).not.toHaveBeenCalled()
  })

  it('keeps Launch live when verify soft-passes with warnings', async () => {
    const executionPublisher = stubExecutionPublisher({
      ok: true,
      liveUrl: 'https://ws_ref.indobase.in',
      stage: 'EmitEvents' as never,
      publishStatus: 'published',
    })
    const verify: BusinessVerifyPort = {
      verify: vi.fn().mockResolvedValue({
        ok: true,
        details: { passed: true, warning_ids: ['robots'] },
      }),
    }

    const launcher = createBusinessLauncher({ executionPublisher, verify })
    const result = await launcher.launch({ workspaceRef: 'ws_ref' })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.status).toBe('live')
    }
  })

  it('passes strictVerify:false through to verify for hosting-only Launch', async () => {
    const executionPublisher = stubExecutionPublisher({
      ok: true,
      liveUrl: 'https://ws_ref.indobase.in',
      stage: 'EmitEvents' as never,
      publishStatus: 'published',
    })
    const verify: BusinessVerifyPort = {
      verify: vi.fn().mockResolvedValue({
        ok: true,
        details: { passed: true, strict_verify: false },
      }),
    }

    const launcher = createBusinessLauncher({ executionPublisher, verify })
    const result = await launcher.launch({
      workspaceRef: 'ws_ref',
      requiredCapabilities: [],
      strictVerify: false,
    })

    expect(result.ok).toBe(true)
    expect(verify.verify).toHaveBeenCalledWith(
      expect.objectContaining({
        strictVerify: false,
      }),
    )
  })

  it('omits strictVerify when unset so Studio can resolve hosting-only soft', async () => {
    const executionPublisher = stubExecutionPublisher({
      ok: true,
      liveUrl: 'https://ws_ref.indobase.in',
      stage: 'EmitEvents' as never,
      publishStatus: 'published',
    })
    const verify: BusinessVerifyPort = {
      verify: vi.fn().mockResolvedValue({ ok: true }),
    }

    const launcher = createBusinessLauncher({ executionPublisher, verify })
    await launcher.launch({ workspaceRef: 'ws_ref' })

    expect(verify.verify).toHaveBeenCalledOnce()
    const arg = vi.mocked(verify.verify).mock.calls[0]?.[0]
    expect(arg).toBeDefined()
    expect(arg).not.toHaveProperty('strictVerify')
  })

  it('skips configure / verify / operator when publish is queued', async () => {
    const executionPublisher = stubExecutionPublisher({
      ok: true,
      liveUrl: 'https://ws_ref.indobase.in',
      stage: 'EmitEvents' as never,
      publishStatus: 'queued',
    })
    const configure: BusinessConfigurePort = {
      configure: vi.fn().mockResolvedValue({ ok: true }),
    }
    const verify: BusinessVerifyPort = {
      verify: vi.fn().mockResolvedValue({ ok: true }),
    }
    const operator: BusinessOperatorPort = {
      startOperator: vi.fn().mockResolvedValue({ ok: true }),
    }

    const launcher = createBusinessLauncher({
      executionPublisher,
      configure,
      verify,
      operator,
    })
    await launcher.launch({ workspaceRef: 'ws_ref' })

    expect(configure.configure).not.toHaveBeenCalled()
    expect(verify.verify).not.toHaveBeenCalled()
    expect(operator.startOperator).not.toHaveBeenCalled()
  })

  it('emits business.launch ExecutionFinished without duplicating DeploymentPublished', async () => {
    const executionPublisher = stubExecutionPublisher({
      ok: true,
      liveUrl: 'https://ws_ref.indobase.in',
      stage: 'EmitEvents' as never,
      publishStatus: 'published',
    })
    const eventBus = createEventBus()
    const types: string[] = []
    const kinds: string[] = []
    eventBus.subscribe('*', (e) => {
      types.push(e.type)
      const payload = e.payload as { kind?: string }
      if (payload.kind) kinds.push(payload.kind)
    })

    const launcher = createBusinessLauncher({ executionPublisher, eventBus })
    await launcher.launch({ workspaceRef: 'ws_ref' })

    expect(types).toEqual(['ExecutionFinished'])
    expect(kinds).toEqual(['business.launch'])
  })

  it('noop ports pass through without breaking launch', async () => {
    const ports = createNoopBusinessLaunchPorts()
    const executionPublisher = stubExecutionPublisher({
      ok: true,
      liveUrl: 'https://ws_ref.indobase.in',
      stage: 'EmitEvents' as never,
      publishStatus: 'published',
    })

    const launcher = createBusinessLauncher({
      executionPublisher,
      ...ports,
    })
    const result = await launcher.launch({ workspaceRef: 'ws_ref' })
    expect(result.ok).toBe(true)
  })
})
