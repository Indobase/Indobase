import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { AGENT_FACING_TOOL_NAMES } from '../production-launch/agent-surface.ts'
import { classifyOperatorIntent, turnClassForIntent } from './execution-contract.ts'
import {
  PLAN_COMMAND,
  authorizeExecutionPlan,
  buildExecutionPlan,
  planCommands,
  validateExecutionPlan,
} from './execution-plan.ts'
import { classifyStoreCommand } from './store-commands.ts'

describe('Execution Engine v2 Phase 1 — ExecutionPlan', () => {
  it('BUILD plan has no launchProductionApp or executeProductionLaunchJob step', () => {
    const intent = classifyOperatorIntent('Build a premium sneaker store called UrbanThread', null)
    const plan = buildExecutionPlan({
      projectRef: 'wsbuild01',
      intent,
      turnClass: turnClassForIntent(intent),
      businessType: 'ecommerce',
      message: 'Build a premium sneaker store called UrbanThread',
    })
    assert.equal(plan.turnClass, 'build')
    assert.equal(plan.intentType, 'create_business')
    assert.ok(plan.operationId)
    assert.ok(plan.commandId)
    assert.ok(plan.idempotencyKey)
    const commands = planCommands(plan)
    assert.equal(commands.includes('launchProductionApp'), false)
    assert.equal(commands.includes(PLAN_COMMAND.productionLaunch), false)
    assert.ok(commands.includes(PLAN_COMMAND.create))
    assert.ok(commands.includes(PLAN_COMMAND.preview))
    assert.equal(validateExecutionPlan(plan).ok, true)
  })

  it('LAUNCH executeProductionLaunchJob dependsOn BUILD preview/artifact', () => {
    const goLive = buildExecutionPlan({
      projectRef: 'wslaunch01',
      intent: 'launch_production',
      turnClass: 'launch',
      businessType: 'ecommerce',
      message: 'Go Live',
    })
    const production = goLive.steps.find((s) => s.command === PLAN_COMMAND.productionLaunch)
    assert.ok(production)
    assert.deepEqual(production.dependsOn, [PLAN_COMMAND.preview])
    assert.equal(validateExecutionPlan(goLive).ok, true)

    const combined = buildExecutionPlan({
      projectRef: 'wslaunch01',
      intent: 'launch_production',
      turnClass: 'launch',
      includeBuild: true,
      businessType: 'ecommerce',
      message: 'Launch a premium sneaker store called UrbanThread',
    })
    assert.ok(combined.steps.some((s) => s.command === PLAN_COMMAND.create))
    const preview = combined.steps.find((s) => s.command === PLAN_COMMAND.preview)
    const launch = combined.steps.find((s) => s.command === PLAN_COMMAND.productionLaunch)
    assert.deepEqual(preview?.dependsOn, [PLAN_COMMAND.create])
    assert.deepEqual(launch?.dependsOn, [PLAN_COMMAND.preview])
    assert.equal(validateExecutionPlan(combined).ok, true)
  })

  it('LAUNCH plan’s production step is executeProductionLaunchJob', () => {
    const intent = classifyOperatorIntent('Go Live — call launchProductionApp for UrbanThread', null)
    const plan = buildExecutionPlan({
      projectRef: 'wslaunch01',
      intent,
      turnClass: turnClassForIntent(intent),
      businessType: 'ecommerce',
      message: 'Go Live',
    })
    assert.equal(plan.turnClass, 'launch')
    const commands = planCommands(plan)
    assert.ok(commands.includes(PLAN_COMMAND.productionLaunch))
    const production = plan.steps.find((s) => s.command === PLAN_COMMAND.productionLaunch)
    assert.ok(production)
    assert.equal(production.command, 'executeProductionLaunchJob')
    assert.equal(validateExecutionPlan(plan).ok, true)
  })

  it('OPERATE store command is a plan step, not a public tool', () => {
    const message = 'Add a red Nike-style running shoe at ₹8,999 with sizes 7–11.'
    const intent = classifyOperatorIntent(message, null)
    const store = classifyStoreCommand(message)
    const plan = buildExecutionPlan({
      projectRef: 'wsoperate01',
      intent,
      turnClass: turnClassForIntent(intent),
      store,
      message,
    })
    assert.equal(plan.turnClass, 'operate')
    assert.equal(store?.kind, 'product.create')
    assert.ok(plan.steps.some((s) => s.command === 'product.create'))
    assert.equal((AGENT_FACING_TOOL_NAMES as readonly string[]).includes('product.create'), false)
    assert.equal((AGENT_FACING_TOOL_NAMES as readonly string[]).includes('manage_catalog'), false)
    assert.equal(authorizeExecutionPlan(plan, 'wsoperate01').ok, true)
    assert.equal(authorizeExecutionPlan(plan, 'otherws01').ok, false)
  })

  it('Launch a … store first turn is BUILD only — no executeProductionLaunchJob', () => {
    const message = 'Launch a premium outdoor gear store called CedarPeak'
    const intent = classifyOperatorIntent(message, null)
    const plan = buildExecutionPlan({
      projectRef: 'wscedar01',
      intent,
      turnClass: turnClassForIntent(intent),
      businessType: 'ecommerce',
      message,
    })
    assert.equal(intent, 'create_business')
    assert.equal(plan.turnClass, 'build')
    assert.equal(planCommands(plan).includes(PLAN_COMMAND.productionLaunch), false)
    assert.equal(validateExecutionPlan(plan).ok, true)
  })

  it('OPERATE NL catalog utterances become store command steps, not other', () => {
    const cases: Array<[string, string]> = [
      ['Add Ridge Pack Extra for ₹8999.', 'product.create'],
      ['change Ridge Pack Extra price to ₹9999', 'product.update'],
      ['set Ridge Pack Extra stock to 12', 'inventory.update'],
      ['create collection Trail Packs', 'collection.create'],
      ['show my products', 'catalog.query'],
      ['mark order ORD-1 fulfilled', 'order.fulfill'],
    ]
    for (const [message, kind] of cases) {
      const intent = classifyOperatorIntent(message, null)
      const store = classifyStoreCommand(message)
      const plan = buildExecutionPlan({
        projectRef: 'wsoperate02',
        intent,
        turnClass: turnClassForIntent(intent),
        store,
        message,
      })
      assert.equal(intent, 'operate', message)
      assert.equal(plan.turnClass, 'operate', message)
      assert.equal(store?.kind, kind, message)
      assert.ok(plan.steps.some((s) => s.command === kind), message)
    }
  })

  it('AGENT_FACING_TOOL_NAMES is still five tools', () => {
    assert.equal(AGENT_FACING_TOOL_NAMES.length, 5)
    assert.deepEqual([...AGENT_FACING_TOOL_NAMES], [
      'launchProductionApp',
      'launchBusiness',
      'connectGateway',
      'productionChecklist',
      'promptQuota',
    ])
  })
})
