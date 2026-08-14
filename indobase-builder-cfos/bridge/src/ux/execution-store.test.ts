import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, it } from 'node:test'

import { AGENT_FACING_TOOL_NAMES } from '../production-launch/agent-surface.ts'
import {
  PLAN_COMMAND,
  PLAN_STEP,
  buildExecutionPlan,
  deriveIdempotencyKey,
} from './execution-plan.ts'
import {
  beginOrResumePlan,
  clearExecutionPlansForTests,
  getCatalogMutation,
  getOperationState,
  getPlanByIdempotencyKey,
  markStepStatus,
  persistExecutionPlan,
} from './execution-store.ts'
import { classifyStoreCommand, createMemoryStoreCommandDeps, executeStoreCommand } from './store-commands.ts'
import { dispatchExecutionPlan } from './executors/index.ts'
import { emptyPersistedRuntime } from './runtime-store.ts'
import type { Session } from '../auth.ts'

describe('Execution Engine v2 Phase 2A — durability', () => {
  let launchDir = ''

  beforeEach(async () => {
    launchDir = await mkdtemp(path.join(os.tmpdir(), 'exec-plan-'))
    process.env.INDOBASE_LAUNCH_ROOT = launchDir
    clearExecutionPlansForTests()
  })

  afterEach(async () => {
    clearExecutionPlansForTests()
    await rm(launchDir, { recursive: true, force: true })
    delete process.env.INDOBASE_LAUNCH_ROOT
  })

  it('persists and reloads a plan from disk after a process restart', () => {
    const plan = buildExecutionPlan({
      projectRef: 'wsdurable01',
      intent: 'create_business',
      turnClass: 'build',
      message: 'Build a premium sneaker store called UrbanThread',
    })
    persistExecutionPlan(plan)
    clearExecutionPlansForTests()
    const reloaded = getOperationState('wsdurable01', plan.operationId)
    assert.ok(reloaded)
    assert.equal(reloaded.operationId, plan.operationId)
    assert.equal(reloaded.idempotencyKey, plan.idempotencyKey)
    assert.equal(reloaded.steps.length, 2)
    assert.equal(reloaded.steps[0]?.command, PLAN_COMMAND.create)
    const byKey = getPlanByIdempotencyKey(plan.idempotencyKey || '')
    assert.equal(byKey?.operationId, plan.operationId)
  })

  it('replay of the same idempotencyKey does not duplicate product.create', async () => {
    const deps = createMemoryStoreCommandDeps()
    const session = { projectRef: 'wsidemp01' }
    const message = 'Add a red Nike-style running shoe at ₹8,999 with sizes 7–11.'
    const store = classifyStoreCommand(message)
    assert.equal(store?.kind, 'product.create')
    const key = deriveIdempotencyKey({
      projectRef: session.projectRef,
      intent: 'operate',
      turnClass: 'operate',
      message,
      store,
    })
    const first = await executeStoreCommand({ session, message, deps, idempotencyKey: key })
    assert.equal(first.ok, true)
    assert.equal(first.mutated, true)
    assert.equal(first.snapshot.products.length, 1)
    const second = await executeStoreCommand({ session, message, deps, idempotencyKey: key })
    assert.equal(second.ok, true)
    assert.equal(second.mutated, false)
    const catalog = await deps.listProducts(session.projectRef)
    assert.equal(catalog.length, 1)
    assert.ok(getCatalogMutation(key)?.resourceId)
  })

  it('interrupted plan resumes remaining steps with the same operationId', async () => {
    const session: Session = {
      gotrueId: 'user-durability',
      email: 'op@indobase.in',
      projectRef: 'wsresume01',
      orgSlug: 'acme',
      projectName: 'Workspace',
      studioUrl: 'https://studio.indobase.in',
    }
    const message = 'Build a premium sneaker store called UrbanThread'
    const plan = buildExecutionPlan({
      projectRef: session.projectRef,
      intent: 'create_business',
      turnClass: 'build',
      message,
    })
    persistExecutionPlan(plan)
    markStepStatus(plan, PLAN_STEP.create, 'succeeded', { resultRef: 'create-1' })
    markStepStatus(plan, PLAN_STEP.preview, 'running')
    clearExecutionPlansForTests()
    const resumed = beginOrResumePlan(plan)
    assert.equal(resumed.operationId, plan.operationId)
    assert.equal(resumed.steps.find((s) => s.stepId === PLAN_STEP.create)?.status, 'succeeded')
    assert.equal(resumed.steps.find((s) => s.stepId === PLAN_STEP.preview)?.status, 'pending')

    const executed = await dispatchExecutionPlan(plan, {
      session,
      message,
      specSource: message,
      runtime: emptyPersistedRuntime(session.projectRef),
    })
    assert.equal(executed.plan.operationId, plan.operationId)
    assert.equal(executed.plan.steps.find((s) => s.stepId === PLAN_STEP.create)?.status, 'succeeded')
    assert.equal(executed.plan.steps.find((s) => s.stepId === PLAN_STEP.preview)?.status, 'succeeded')
    assert.equal(executed.plan.steps.find((s) => s.stepId === PLAN_STEP.create)?.resultRef, 'create-1')
  })

  it('AGENT_FACING_TOOL_NAMES is still five tools', () => {
    assert.equal(AGENT_FACING_TOOL_NAMES.length, 5)
  })
})
