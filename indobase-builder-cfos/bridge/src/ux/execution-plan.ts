/**
 * Internal execution plan — not a public agent tool.
 * classifyOperatorIntent + optional store command → steps the runtime executes.
 * The LLM never executes this plan.
 * Phase 2A: plans are persisted (execution-store). IDs are durable across process restart.
 */

import { createHash } from 'node:crypto'

import { createCommandId, createExecutionId } from '@indobase/platform'

import type { ExecutionTurnClass, OperatorIntentKind } from './execution-contract.js'
import type { ClassifiedStoreCommand } from './store-commands.js'

export const PLAN_COMMAND = {
  create: 'runtime.create',
  preview: 'runtime.preview',
  productionLaunch: 'executeProductionLaunchJob',
} as const

export const PLAN_STEP = {
  create: 'runtime.create',
  preview: 'runtime.preview',
  productionLaunch: 'executeProductionLaunchJob',
} as const

export type ExecutionStepStatus = 'pending' | 'running' | 'succeeded' | 'failed'

export type ExecutionPlanStep = {
  stepId: string
  command: string
  target?: string
  arguments?: Record<string, unknown>
  /** Step ids that must succeed before this step may start. */
  dependsOn?: string[]
  status?: ExecutionStepStatus
  startedAt?: string
  finishedAt?: string
  error?: string
  resultRef?: string
}

export type ExecutionPlan = {
  operationId: string
  projectRef: string
  turnClass: ExecutionTurnClass
  intentType: OperatorIntentKind
  businessType?: string
  steps: ExecutionPlanStep[]
  idempotencyKey?: string
  commandId?: string
}

export type BuildExecutionPlanInput = {
  projectRef: string
  intent: OperatorIntentKind
  turnClass: ExecutionTurnClass
  businessType?: string
  store?: ClassifiedStoreCommand | null
  message?: string
  /** BUILD preview/artifact then LAUNCH in one plan (explicit "Launch a … store"). */
  includeBuild?: boolean
  /** Client-supplied idempotency key, if any. */
  clientIdempotencyKey?: string
}

export function fingerprintIntent(message: string): string {
  return (message || '').trim().toLowerCase().replace(/\s+/g, ' ')
}

export function deriveIdempotencyKey(input: {
  projectRef: string
  intent: OperatorIntentKind | string
  turnClass: ExecutionTurnClass | string
  message?: string
  store?: ClassifiedStoreCommand | null
  clientIdempotencyKey?: string
}): string {
  const projectRef = (input.projectRef || '').trim()
  const client = (input.clientIdempotencyKey || '').trim()
  if (client) return `${projectRef}:${client}`
  const storeFp = input.store
    ? [
        input.store.kind,
        input.store.name || '',
        String(input.store.priceMajor ?? ''),
        JSON.stringify(input.store.options || {}),
      ].join('|')
    : ''
  const digest = createHash('sha256')
    .update([projectRef, input.intent, input.turnClass, fingerprintIntent(input.message || ''), storeFp].join('\n'))
    .digest('hex')
    .slice(0, 32)
  return `${projectRef}:${input.intent}:${digest}`
}

export function deriveStoreMutationKey(
  projectRef: string,
  store: ClassifiedStoreCommand,
  message?: string,
): string {
  return deriveIdempotencyKey({
    projectRef,
    intent: 'operate',
    turnClass: 'operate',
    message,
    store,
  })
}

export function buildExecutionPlan(input: BuildExecutionPlanInput): ExecutionPlan {
  const projectRef = (input.projectRef || '').trim()
  const operationId = createExecutionId()
  const commandId = createCommandId()
  const idempotencyKey = deriveIdempotencyKey(input)
  const steps = stepsForTurn(input)
  return {
    operationId,
    projectRef,
    turnClass: input.turnClass,
    intentType: input.intent,
    businessType: input.businessType,
    steps,
    idempotencyKey,
    commandId,
  }
}

function step(
  stepId: string,
  command: string,
  extra: Omit<ExecutionPlanStep, 'stepId' | 'command' | 'status'> = {},
): ExecutionPlanStep {
  return {
    stepId,
    command,
    status: 'pending',
    ...extra,
    dependsOn: extra.dependsOn || [],
  }
}

function stepsForTurn(input: BuildExecutionPlanInput): ExecutionPlanStep[] {
  const { turnClass, store, projectRef } = input
  if (turnClass === 'account') return []
  if (turnClass === 'build') {
    return [
      step(PLAN_STEP.create, PLAN_COMMAND.create, { target: projectRef, arguments: { spec: true } }),
      step(PLAN_STEP.preview, PLAN_COMMAND.preview, {
        target: projectRef,
        dependsOn: [PLAN_STEP.create],
      }),
    ]
  }
  if (turnClass === 'launch') {
    const buildSteps = input.includeBuild
      ? [
          step(PLAN_STEP.create, PLAN_COMMAND.create, { target: projectRef, arguments: { spec: true } }),
          step(PLAN_STEP.preview, PLAN_COMMAND.preview, {
            target: projectRef,
            dependsOn: [PLAN_STEP.create],
          }),
        ]
      : [
          step(PLAN_STEP.preview, PLAN_COMMAND.preview, {
            target: projectRef,
            arguments: { reuseArtifact: true },
          }),
        ]
    return [
      ...buildSteps,
      step(PLAN_STEP.productionLaunch, PLAN_COMMAND.productionLaunch, {
        target: projectRef,
        dependsOn: [PLAN_STEP.preview],
        arguments: { production: true },
      }),
    ]
  }
  if (turnClass === 'modify') {
    return [
      step(PLAN_STEP.preview, PLAN_COMMAND.preview, {
        target: projectRef,
        arguments: { mutation: 'hero_headline' },
      }),
    ]
  }
  if (turnClass === 'operate') {
    if (store?.kind) {
      return [
        step(store.kind, store.kind, {
          target: projectRef,
          arguments: { readOnly: store.readOnly, kind: store.kind },
        }),
      ]
    }
    return [step('runtime.query', 'runtime.query', { target: projectRef })]
  }
  return []
}

export function validateExecutionPlan(plan: ExecutionPlan): { ok: boolean; error?: string } {
  if (!plan.projectRef) return { ok: false, error: 'projectRef required' }
  const commands = plan.steps.map((s) => s.command)
  if (plan.turnClass === 'build') {
    if (commands.includes('launchProductionApp') || commands.includes(PLAN_COMMAND.productionLaunch)) {
      return { ok: false, error: 'BUILD plan must not launch production' }
    }
  }
  if (plan.turnClass === 'launch') {
    if (!commands.includes(PLAN_COMMAND.productionLaunch)) {
      return { ok: false, error: 'LAUNCH plan requires executeProductionLaunchJob' }
    }
    const launchStep = plan.steps.find((s) => s.command === PLAN_COMMAND.productionLaunch)
    const deps = launchStep?.dependsOn || []
    if (!deps.includes(PLAN_STEP.preview)) {
      return { ok: false, error: 'executeProductionLaunchJob must dependOn BUILD preview/artifact' }
    }
  }
  if (plan.turnClass === 'operate' && plan.steps.some((s) => s.command === 'launchProductionApp')) {
    return { ok: false, error: 'OPERATE must not launch production' }
  }
  return { ok: true }
}

export function authorizeExecutionPlan(
  plan: ExecutionPlan,
  sessionProjectRef: string,
): { ok: boolean; error?: string } {
  const sessionRef = (sessionProjectRef || '').trim()
  if (!sessionRef || plan.projectRef !== sessionRef) {
    return { ok: false, error: 'session projectRef is the only allowed workspace' }
  }
  return { ok: true }
}

export function planCommands(plan: ExecutionPlan): string[] {
  return plan.steps.map((s) => s.command)
}

export function stepSucceeded(plan: ExecutionPlan, stepId: string): boolean {
  const found = plan.steps.find((s) => s.stepId === stepId || s.command === stepId)
  return found?.status === 'succeeded'
}
