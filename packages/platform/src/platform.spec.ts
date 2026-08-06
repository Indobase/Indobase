import { describe, expect, it } from 'vitest'
import {
  Platform,
  createPlatform,
  CapabilityCommands,
  ExecutionCommands,
  WorkspaceSessionCommands,
  identityFromClaims,
  createWorkspace,
  createWorkspaceCommand,
  createDocumentRef,
  createDesignDocument,
  designToDocumentRef,
  createEventBus,
  createExecutionRequest,
  toExecutionResult,
  toPlatformEvent,
  toPlatformCommand,
  provisionerRouteForExecution,
  validateMutationSet,
  buildGenerationCapabilityContext,
  formatGenerationCapabilityContextPrompt,
  FORBIDDEN_RUNTIME_ABI_KEYS,
  BUILDER_COMMAND_TO_KIND,
  PROVISIONER_ROUTE_TO_EXECUTION,
  EMPTY_SNAPSHOT_ID,
} from './index'

describe('@indobase/platform', () => {
  it('registers Gen-1 capabilities', () => {
    const ids = Platform.capabilities.list().map((c) => c.id).sort()
    expect(ids).toEqual([
      'auth',
      'businessData',
      'catalog',
      'commerce',
      'events',
      'functions',
    ])
  })

  it('resolves auth bindings from data plane without product hosts', () => {
    const runtime = Platform.resolve({
      projectRef: 'proj_abc',
      dataPlane: {
        url: 'https://proj_abc.indobase.in',
        anonKey: 'anon-key',
      },
    })

    expect(runtime.schemaVersion).toBe(1)
    expect(runtime.capabilities.auth?.enabled).toBe(true)
    expect(runtime.capabilities.auth?.bindings.env?.VITE_INDOBASE_URL).toBe(
      'https://proj_abc.indobase.in',
    )
    expect(runtime.capabilities.auth?.bindings.sdk?.package).toBe('@indobaseinc/indobase-js')
    expect(runtime.capabilities.commerce).toBeUndefined()
  })

  it('ProjectRuntime ABI excludes forbidden non-capability fields', () => {
    const runtime = Platform.resolveProjectRuntime({
      projectRef: 'proj_abc',
      dataPlane: { url: 'https://x.indobase.in', anonKey: 'k' },
      actor: { role: 'owner', plan: 'pro' },
    })

    for (const key of FORBIDDEN_RUNTIME_ABI_KEYS) {
      expect(Object.prototype.hasOwnProperty.call(runtime, key)).toBe(false)
    }
    // actor.plan is input-only — must not leak onto ABI
    expect((runtime as Record<string, unknown>).plan).toBeUndefined()
    expect((runtime as Record<string, unknown>).studioUrl).toBeUndefined()
    expect((runtime as Record<string, unknown>).billingStatus).toBeUndefined()
    expect(Object.keys(runtime).sort()).toEqual([
      'capabilities',
      'dataPlane',
      'projectRef',
      'runtimeVersion',
      'schemaVersion',
    ])
  })

  it('buildGenerationCapabilityContext is prompt-safe and capability-shaped', () => {
    const runtime = Platform.resolve({
      projectRef: 'proj_abc',
      dataPlane: { url: 'https://proj_abc.indobase.in', anonKey: 'anon' },
      capabilities: {
        commerce: {
          enabled: true,
          intents: ['checkout'],
          permissions: ['checkout:create'],
          bindings: {
            endpoints: {
              createCheckout: '/functions/v1/commerce-checkout',
              // product host must be scrubbed from generation context
              bad: 'https://payments.indobase.in/checkout',
            },
          },
        },
      },
    })

    const ctx = buildGenerationCapabilityContext(runtime)
    expect(ctx.schemaVersion).toBe(1)
    expect(ctx.projectRef).toBe('proj_abc')
    expect(ctx.capabilities.map((c) => c.id)).toEqual(['auth', 'commerce'])
    const commerce = ctx.capabilities.find((c) => c.id === 'commerce')
    expect(commerce?.endpoints?.createCheckout).toBe('/functions/v1/commerce-checkout')
    expect(commerce?.endpoints?.bad).toBeUndefined()

    const prompt = formatGenerationCapabilityContextPrompt(ctx)
    expect(prompt).toContain('commerce')
    expect(prompt).toContain('Capability Resolver')
    expect(prompt).not.toContain('payments.indobase.in')
    expect(Platform.formatGenerationCapabilityContextPrompt(runtime)).toContain('auth')
  })

  it('does not invent commerce/events without ensurer overrides', () => {
    const runtime = Platform.resolve({
      projectRef: 'proj_abc',
      dataPlane: { url: 'https://x.indobase.in', anonKey: 'k' },
    })
    expect(runtime.capabilities.events).toBeUndefined()
    expect(runtime.capabilities.businessData).toBeUndefined()
  })

  it('accepts capability overrides from ensurer path (still read-only resolve)', () => {
    const runtime = Platform.resolve({
      projectRef: 'proj_abc',
      dataPlane: { url: 'https://x.indobase.in', anonKey: 'k' },
      capabilities: {
        commerce: {
          enabled: true,
          intents: ['checkout'],
          permissions: ['checkout:create'],
          bindings: {
            endpoints: { createCheckout: '/functions/v1/commerce-checkout' },
          },
        },
      },
    })
    expect(runtime.capabilities.commerce?.bindings.endpoints?.createCheckout).toContain(
      'commerce-checkout',
    )
  })

  it('exposes capability command constructors without side effects', () => {
    const cmd = CapabilityCommands.ensure('proj_abc', 'commerce')
    expect(cmd.kind).toBe('capability.ensure')
    expect(cmd.payload).toMatchObject({ projectRef: 'proj_abc', capability: 'commerce' })
    expect(cmd.id).toMatch(/^cmd_/)
  })

  it('supports empty platform without Gen-1', () => {
    const p = createPlatform({ registerGen1: false })
    expect(p.capabilities.list()).toHaveLength(0)
    p.capabilities.register({
      id: 'auth',
      label: 'Auth',
      intents: ['signIn'],
      defaultPermissions: ['auth:signIn'],
    })
    expect(p.getCapability('auth')?.intents).toContain('signIn')
  })

  it('wraps identity claims', () => {
    const ctx = identityFromClaims({
      sub: 'user_1',
      project_ref: 'proj_x',
      organization_id: 'org_1',
      role: 'owner',
    })
    expect(ctx.actor.kind).toBe('user')
    expect(ctx.projectRef).toBe('proj_x')
  })

  it('creates workspace and document envelopes', () => {
    const ws = createWorkspace({ kind: 'builder', projectRef: 'proj_x' })
    expect(ws.headSnapshotId).toBe(EMPTY_SNAPSHOT_ID)
    expect(ws.kind).toBe('builder')

    const doc = createDocumentRef({ kind: 'design', projectRef: 'proj_x' })
    expect(doc.kind).toBe('design')
    expect(doc.schemaVersion).toBe(1)

    const design = createDesignDocument({ projectRef: 'proj_x', payload: { nodes: [] } })
    expect(design.ref.kind).toBe('design')
    expect(design.payload).toEqual({ nodes: [] })
    expect(designToDocumentRef({ id: design.ref.id, projectRef: 'proj_x' }).kind).toBe('design')
  })

  it('exposes execution commands mapped from provisioner language', () => {
    const repair = ExecutionCommands.repair('proj_x', 'builder_preflight')
    expect(repair.kind).toBe('execution.repair')
    expect(repair.payload.reason).toBe('builder_preflight')
    expect(PROVISIONER_ROUTE_TO_EXECUTION['/repair-stack']).toBe('execution.repair')
    expect(Platform.execution.provision('proj_x').kind).toBe('execution.provision')
  })

  it('maps execution kinds to provisioner routes and results', () => {
    expect(provisionerRouteForExecution('execution.repair')).toBe('/repair-stack')
    expect(provisionerRouteForExecution('execution.provision', { sharedGateway: true })).toBe(
      '/provision-shared-gateway',
    )
    const req = createExecutionRequest({
      kind: 'execution.build',
      projectRef: 'proj_x',
      reason: 'draft_preview',
    })
    expect(req.id).toMatch(/^exec_/)
    const ok = toExecutionResult(req, { ok: true, outputRef: 'https://example/draft' })
    expect(ok).toMatchObject({ ok: true, status: 'succeeded', outputRef: 'https://example/draft' })
    const fail = toExecutionResult(req, { ok: false, error: 'boom' })
    expect(fail).toMatchObject({ ok: false, status: 'failed', error: 'boom' })
  })

  it('validates workspace mutations and maps Builder commands', () => {
    const mutations = {
      files: [
        { kind: 'upsert' as const, path: '/home/project/src/App.tsx', content: 'export {}' },
        { kind: 'delete' as const, path: 'old.ts' },
      ],
    }
    expect(validateMutationSet(mutations)).toBeUndefined()
    expect(mutations.files[0]?.path).toBe('src/App.tsx')

    expect(validateMutationSet({ files: [{ kind: 'upsert', path: '../etc/passwd', content: 'x' }] })).toMatch(
      /Rejected path/,
    )

    const cmd = createWorkspaceCommand({
      type: 'ModifyWorkspace',
      intent: 'repair',
      scope: 'multi-file',
      reason: 'diagnostics',
      baseSnapshotId: EMPTY_SNAPSHOT_ID,
    })
    expect(BUILDER_COMMAND_TO_KIND[cmd.type]).toBe('workspace.modify')
    expect(WorkspaceSessionCommands.modify('proj_x').kind).toBe('workspace.modify')
    expect(toPlatformCommand(cmd, 'proj_x').kind).toBe('workspace.modify')
  })

  it('wraps domain events into PlatformEvent envelopes', () => {
    const pe = toPlatformEvent(
      {
        type: 'ExecutionFinished',
        executionId: 'exec_1',
        kind: 'execution.repair',
        ok: true,
        at: Date.now(),
      },
      { projectRef: 'proj_x' },
    )
    expect(pe.type).toBe('ExecutionFinished')
    expect(pe.projectRef).toBe('proj_x')
  })

  it('delivers events on the in-process bus', () => {
    const bus = createEventBus()
    const seen: string[] = []
    bus.subscribe('WorkspaceCommitted', (e) => seen.push(e.type))
    bus.publish({ type: 'WorkspaceCommitted', payload: { version: 1 }, at: new Date().toISOString() })
    expect(seen).toEqual(['WorkspaceCommitted'])
  })
})
