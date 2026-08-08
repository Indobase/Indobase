import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  Platform,
  createCommand,
  createEventBus,
  createPlatform,
} from '@indobase/platform'
import {
  createAgentRuntime,
  noopPlanner,
  passthroughExecutor,
  singleStepPlan,
} from './index'

const here = dirname(fileURLToPath(import.meta.url))

describe('@indobase/agent-runtime', () => {
  it('resolves capabilities via Platform.resolve + generation context', () => {
    const runtime = createAgentRuntime({
      createIsolatedPlatform: true,
      eventBus: createEventBus(),
    })

    const result = runtime.resolveCapabilities({
      projectRef: 'proj_abc',
      dataPlane: { url: 'https://proj_abc.indobase.in', anonKey: 'anon' },
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

    expect(result.runtime.projectRef).toBe('proj_abc')
    expect(result.runtime.capabilities.auth?.enabled).toBe(true)
    expect(result.runtime.capabilities.commerce?.enabled).toBe(true)
    expect(result.generation.capabilities.map((c) => c.id).sort()).toEqual([
      'auth',
      'commerce',
    ])
    expect(result.prompt).toContain('commerce')
    expect(result.prompt).toContain('Capability Resolver')
  })

  it('run lifecycle emits AgentRunStarted / AgentRunFinished on the bus', () => {
    const bus = createEventBus()
    const seen: string[] = []
    bus.subscribe('*', (e) => seen.push(e.type))

    const rt = createAgentRuntime({
      platform: Platform,
      eventBus: bus,
    })

    const run = rt.beginRun({ projectRef: 'proj_x', goal: 'smoke' })
    expect(run.status).toBe('running')
    expect(run.id).toMatch(/^arun_/)

    const finished = rt.finishRun(run.id, { status: 'succeeded' })
    expect(finished.status).toBe('succeeded')
    expect(finished.finishedAt).toBeTruthy()
    expect(seen).toEqual(['AgentRunStarted', 'AgentRunFinished'])
  })

  it('queueCommand publishes CommandQueued via platform bus', () => {
    const bus = createEventBus()
    const payloads: unknown[] = []
    bus.subscribe('CommandQueued', (e) => payloads.push(e.payload))

    const rt = createAgentRuntime({ eventBus: bus })
    const cmd = createCommand('workspace.modify', { reason: 'test' }, {
      projectRef: 'proj_x',
    })
    rt.queueCommand(cmd, { projectRef: 'proj_x' })

    expect(payloads).toHaveLength(1)
    expect(payloads[0]).toMatchObject({
      type: 'CommandQueued',
      commandId: cmd.id,
    })
  })

  it('planner / executor injectors default to no-op / passthrough', async () => {
    const rt = createAgentRuntime({ createIsolatedPlatform: true })
    const run = rt.beginRun({ goal: 'noop' })

    const plan = await rt.plan({ run, goal: 'noop' })
    expect(plan.runId).toBe(run.id)
    expect(plan.steps).toEqual([])

    const stepped = singleStepPlan(run.id, 'inspect', { path: '/' })
    const out = await rt.executeStep({
      run,
      plan: stepped,
      step: stepped.steps[0]!,
    })
    expect(out.status).toBe('succeeded')
    expect(out.kind).toBe('inspect')
  })

  it('accepts custom planner / executor injectors', async () => {
    const rt = createAgentRuntime({
      createIsolatedPlatform: true,
      planner: async ({ run, goal }) => ({
        runId: run.id,
        goal,
        steps: [{ id: 's1', kind: 'codegen', status: 'pending' }],
      }),
      executor: async ({ step }) => ({ ...step, status: 'succeeded', output: { ok: true } }),
    })

    const run = rt.beginRun()
    const plan = await rt.plan({ run, goal: 'build' })
    expect(plan.steps).toHaveLength(1)
    const result = await rt.executeStep({ run, plan, step: plan.steps[0]! })
    expect(result.output).toEqual({ ok: true })
  })

  it('memory is append-only and keyed by runId / projectRef', () => {
    const rt = createAgentRuntime({ createIsolatedPlatform: true })
    const run = rt.beginRun({ projectRef: 'proj_m' })

    rt.memory.append(run.id, 'first note', { projectRef: 'proj_m', tags: ['plan'] })
    rt.memory.append(run.id, 'second note', { projectRef: 'proj_m' })

    expect(rt.memory.list(run.id).map((n) => n.text)).toEqual(['first note', 'second note'])
    expect(rt.memory.listByProject('proj_m')).toHaveLength(2)
    expect(rt.memory.get(run.id)?.notes).toHaveLength(2)

    rt.memory.clear(run.id)
    expect(rt.memory.list(run.id)).toEqual([])
  })

  it('kernel has no reverse dependency on agent-runtime', () => {
    const platformPkg = JSON.parse(
      readFileSync(resolve(here, '../../platform/package.json'), 'utf8'),
    ) as { dependencies?: Record<string, string>; name: string }
    expect(platformPkg.name).toBe('@indobase/platform')
    expect(platformPkg.dependencies?.['@indobase/agent-runtime']).toBeUndefined()

    // Smoke: platform createPlatform still works independently
    const p = createPlatform({ registerGen1: false })
    expect(p.capabilities.list()).toHaveLength(0)

    // Defaults are importable without side effects
    expect(typeof noopPlanner).toBe('function')
    expect(typeof passthroughExecutor).toBe('function')
  })
})
