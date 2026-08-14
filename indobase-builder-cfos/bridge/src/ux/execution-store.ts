/**
 * Durable ExecutionPlan store — disk JSON, same pattern as production-launch/job-store.
 * Phase 2A: persist plans, step status, operation state, and mutation idempotency.
 * Not Kafka / Redis / a new cloud service.
 */

import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'

import type { ExecutionPlan, ExecutionPlanStep, ExecutionStepStatus } from './execution-plan.js'

export const EXECUTION_PLAN_VERSION = 'execution-plan/v1' as const

export type DurablePlanStatus = 'pending' | 'running' | 'succeeded' | 'failed' | 'interrupted'

export type DurableExecutionPlan = ExecutionPlan & {
  version: typeof EXECUTION_PLAN_VERSION
  status: DurablePlanStatus
  createdAt: string
  updatedAt: string
}

export type CatalogMutationRecord = {
  idempotencyKey: string
  projectRef: string
  kind: string
  resourceId: string
  createdAt: string
}

const plans = new Map<string, DurableExecutionPlan>()
const latestByProject = new Map<string, string>()
const operationByIdempotency = new Map<string, string>()
const mutations = new Map<string, CatalogMutationRecord>()

function launchRoot(): string {
  return (
    process.env.INDOBASE_EXECUTION_PLAN_DIR?.trim() ||
    process.env.INDOBASE_LAUNCH_ROOT?.trim() ||
    path.join(process.cwd(), '.indobase-launches')
  )
}

function storeDir(): string {
  return path.join(launchRoot(), 'execution-plans')
}

function sanitizeRef(ref: string): string {
  const cleaned = ref.replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64)
  return cleaned || 'unknown'
}

function keyHash(key: string): string {
  return createHash('sha256').update(key).digest('hex').slice(0, 40)
}

function planPath(projectRef: string, operationId: string): string {
  return path.join(storeDir(), sanitizeRef(projectRef), `${sanitizeRef(operationId)}.json`)
}

function latestPath(projectRef: string): string {
  return path.join(storeDir(), sanitizeRef(projectRef), 'latest.txt')
}

function idempotencyPath(key: string): string {
  return path.join(storeDir(), 'idempotency', `${keyHash(key)}.txt`)
}

function mutationPath(key: string): string {
  return path.join(storeDir(), 'mutations', `${keyHash(key)}.json`)
}

function atomicWrite(file: string, body: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`
  fs.writeFileSync(tmp, body, 'utf8')
  fs.renameSync(tmp, file)
}

function nowIso(): string {
  return new Date().toISOString()
}

function recoverInterrupted(plan: DurableExecutionPlan): DurableExecutionPlan {
  const steps = plan.steps.map((s) =>
    s.status === 'running' ? { ...s, status: 'pending' as const } : s,
  )
  const incomplete = steps.some((s) => s.status !== 'succeeded')
  const status: DurablePlanStatus =
    plan.status === 'succeeded' && !incomplete
      ? 'succeeded'
      : incomplete
        ? plan.status === 'failed'
          ? 'failed'
          : 'interrupted'
        : 'succeeded'
  return { ...plan, steps, status, updatedAt: nowIso() }
}

function writePlan(plan: DurableExecutionPlan): DurableExecutionPlan {
  const stored: DurableExecutionPlan = { ...plan, version: EXECUTION_PLAN_VERSION, updatedAt: nowIso() }
  plans.set(stored.operationId, stored)
  latestByProject.set(stored.projectRef, stored.operationId)
  if (stored.idempotencyKey) operationByIdempotency.set(stored.idempotencyKey, stored.operationId)
  atomicWrite(planPath(stored.projectRef, stored.operationId), JSON.stringify(stored, null, 2))
  atomicWrite(latestPath(stored.projectRef), stored.operationId)
  if (stored.idempotencyKey) atomicWrite(idempotencyPath(stored.idempotencyKey), stored.operationId)
  return stored
}

function readPlanFile(projectRef: string, operationId: string): DurableExecutionPlan | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(planPath(projectRef, operationId), 'utf8')) as DurableExecutionPlan
    if (!parsed?.operationId || parsed.version !== EXECUTION_PLAN_VERSION) return null
    return parsed
  } catch {
    return null
  }
}

export function persistExecutionPlan(plan: ExecutionPlan): DurableExecutionPlan {
  const existing = plans.get(plan.operationId)
  const now = nowIso()
  const durable: DurableExecutionPlan = {
    ...plan,
    version: EXECUTION_PLAN_VERSION,
    status: existing?.status || 'pending',
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    steps: plan.steps.map((s) => ({
      ...s,
      stepId: s.stepId || s.command,
      dependsOn: s.dependsOn || [],
      status: s.status || 'pending',
    })),
  }
  return writePlan(durable)
}

export function getExecutionPlan(operationId: string, projectRef?: string): DurableExecutionPlan | null {
  const id = operationId.trim()
  if (!id) return null
  const cached = plans.get(id)
  if (cached) return cached
  if (projectRef) {
    const fromDisk = readPlanFile(projectRef, id)
    if (fromDisk) {
      plans.set(fromDisk.operationId, fromDisk)
      return fromDisk
    }
  }
  return null
}

export function getOperationState(projectRef: string, operationId: string): DurableExecutionPlan | null {
  return getExecutionPlan(operationId, projectRef) || readPlanFile(projectRef, operationId)
}

export function getLatestExecutionPlan(projectRef: string): DurableExecutionPlan | null {
  const ref = projectRef.trim()
  if (!ref) return null
  const id = latestByProject.get(ref)
  if (id) return getExecutionPlan(id, ref)
  try {
    const latestId = fs.readFileSync(latestPath(ref), 'utf8').trim()
    return latestId ? getExecutionPlan(latestId, ref) : null
  } catch {
    return null
  }
}

export function getPlanByIdempotencyKey(idempotencyKey: string): DurableExecutionPlan | null {
  const key = (idempotencyKey || '').trim()
  if (!key) return null
  const id = operationByIdempotency.get(key)
  if (id) {
    const cached = plans.get(id)
    if (cached) return cached
  }
  try {
    const operationId = fs.readFileSync(idempotencyPath(key), 'utf8').trim()
    if (!operationId) return null
    const projectHint = key.split(':')[0] || ''
    return getExecutionPlan(operationId, projectHint)
  } catch {
    return null
  }
}

export function beginOrResumePlan(plan: ExecutionPlan): DurableExecutionPlan {
  const key = (plan.idempotencyKey || '').trim()
  if (key) {
    const existing = getPlanByIdempotencyKey(key)
    if (existing) {
      const recovered = recoverInterrupted(existing)
      if (recovered.status === 'interrupted' || recovered.status === 'pending' || recovered.status === 'running') {
        return writePlan({ ...recovered, status: 'running' })
      }
      return recovered
    }
  }
  return writePlan({
    ...plan,
    version: EXECUTION_PLAN_VERSION,
    status: 'running',
    createdAt: nowIso(),
    updatedAt: nowIso(),
    steps: plan.steps.map((s) => ({
      ...s,
      stepId: s.stepId || s.command,
      dependsOn: s.dependsOn || [],
      status: s.status || 'pending',
    })),
  })
}

export function markPlanStatus(operationId: string, status: DurablePlanStatus, projectRef?: string): DurableExecutionPlan | null {
  const plan = getExecutionPlan(operationId, projectRef)
  if (!plan) return null
  return writePlan({ ...plan, status })
}

export function patchExecutionStep(
  operationId: string,
  stepId: string,
  patch: Partial<ExecutionPlanStep>,
  projectRef?: string,
): DurableExecutionPlan | null {
  const plan = getExecutionPlan(operationId, projectRef)
  if (!plan) return null
  const steps = plan.steps.map((s) => (s.stepId === stepId || s.command === stepId ? { ...s, ...patch } : s))
  const allDone = steps.every((s) => s.status === 'succeeded')
  const anyFailed = steps.some((s) => s.status === 'failed')
  const status: DurablePlanStatus = anyFailed ? 'failed' : allDone ? 'succeeded' : 'running'
  return writePlan({ ...plan, steps, status })
}

export function markStepStatus(
  plan: ExecutionPlan,
  stepId: string,
  status: ExecutionStepStatus,
  extra: { error?: string; resultRef?: string } = {},
): DurableExecutionPlan {
  const now = nowIso()
  const patch: Partial<ExecutionPlanStep> = {
    status,
    ...(status === 'running' ? { startedAt: now } : {}),
    ...(status === 'succeeded' || status === 'failed' ? { finishedAt: now } : {}),
    ...(extra.error ? { error: extra.error } : {}),
    ...(extra.resultRef ? { resultRef: extra.resultRef } : {}),
  }
  const updated = patchExecutionStep(plan.operationId, stepId, patch, plan.projectRef)
  return updated || persistExecutionPlan(plan)
}

export function dependenciesSatisfied(plan: ExecutionPlan, step: ExecutionPlanStep): boolean {
  const deps = step.dependsOn || []
  if (!deps.length) return true
  return deps.every((dep) => {
    const found = plan.steps.find((s) => s.stepId === dep || s.command === dep)
    return found?.status === 'succeeded'
  })
}

export function rememberCatalogMutation(record: CatalogMutationRecord): CatalogMutationRecord {
  mutations.set(record.idempotencyKey, record)
  atomicWrite(mutationPath(record.idempotencyKey), JSON.stringify(record, null, 2))
  return record
}

export function getCatalogMutation(idempotencyKey: string): CatalogMutationRecord | null {
  const key = (idempotencyKey || '').trim()
  if (!key) return null
  const cached = mutations.get(key)
  if (cached) return cached
  try {
    const parsed = JSON.parse(fs.readFileSync(mutationPath(key), 'utf8')) as CatalogMutationRecord
    if (!parsed?.idempotencyKey) return null
    mutations.set(key, parsed)
    return parsed
  } catch {
    return null
  }
}

export function clearExecutionPlansForTests(): void {
  plans.clear()
  latestByProject.clear()
  operationByIdempotency.clear()
  mutations.clear()
}
