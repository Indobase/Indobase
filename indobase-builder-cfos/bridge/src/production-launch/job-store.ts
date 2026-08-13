/**
 * Durable ProductionLaunchJob store (per jobId + latest-by-project).
 */

import fs from 'node:fs'
import path from 'node:path'
import { randomBytes } from 'node:crypto'

import type { BackendConfig } from '../auth.js'
import type { ApplicationPlan, ProductionAppType } from './application-planner.js'
import type { ProductionApplicationContract } from './production-contract.js'
import type { ProductionLaunchEvidence } from './evidence.js'

export const PRODUCTION_LAUNCH_JOB_VERSION = 'production-launch-job/v1' as const
export const MAX_REPAIR_ATTEMPTS = 3

export type ProductionLaunchStageId =
  | 'classify'
  | 'contract'
  | 'provision'
  | 'generate'
  | 'wire'
  | 'verify'
  | 'deploy'
  | 'smoke'
  | 'live'

export type ProductionLaunchStageStatus = 'pending' | 'running' | 'ok' | 'skipped' | 'failed'

export type ProductionLaunchStage = {
  id: ProductionLaunchStageId
  title: string
  status: ProductionLaunchStageStatus
  message?: string
  startedAt?: string
  finishedAt?: string
}

export type ProductionLaunchJobStatus =
  | 'queued'
  | 'running'
  | 'awaiting_generate'
  | 'live'
  | 'blocked'

export type ProductionLaunchFailure = {
  code: string
  severity: 'critical' | 'warning'
  stage: ProductionLaunchStageId
  message: string
  repairable: boolean
  repair_hint?: string
}

export type ProductionLaunchJob = {
  version: typeof PRODUCTION_LAUNCH_JOB_VERSION
  jobId: string
  projectRef: string
  gotrueId: string
  email: string
  intent: string
  production: true
  appType: ProductionAppType
  plan: ApplicationPlan
  contract: ProductionApplicationContract
  status: ProductionLaunchJobStatus
  stages: ProductionLaunchStage[]
  html?: string
  files?: Record<string, string>
  title?: string
  brand?: string
  vertical?: string
  backend?: BackendConfig | null
  url?: string
  claim_live: boolean
  /** Machine-owned certification — never agent-authored. */
  evidence?: ProductionLaunchEvidence
  repairAttempts: number
  failures: ProductionLaunchFailure[]
  createdAt: string
  updatedAt: string
}

const STAGE_DEFS: Array<{ id: ProductionLaunchStageId; title: string }> = [
  { id: 'classify', title: 'Classify application' },
  { id: 'contract', title: 'Create application contract' },
  { id: 'provision', title: 'Provision auth + database' },
  { id: 'generate', title: 'Generate production UI' },
  { id: 'wire', title: 'Bind runtime APIs' },
  { id: 'verify', title: 'Verify contract' },
  { id: 'deploy', title: 'Deploy' },
  { id: 'smoke', title: 'Production smoke test' },
  { id: 'live', title: 'Mark LIVE' },
]

const jobs = new Map<string, ProductionLaunchJob>()
const latestByProject = new Map<string, string>()

function launchRoot(): string {
  return (
    process.env.INDOBASE_PRODUCTION_JOB_DIR?.trim() ||
    process.env.INDOBASE_LAUNCH_ROOT?.trim() ||
    path.join(process.cwd(), '.indobase-launches')
  )
}

function storeDir(): string {
  return path.join(launchRoot(), 'production-jobs')
}

function sanitizeRef(ref: string): string {
  const cleaned = ref.replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64)
  return cleaned || 'unknown'
}

function filePathFor(jobId: string): string {
  return path.join(storeDir(), `${sanitizeRef(jobId)}.json`)
}

function latestPathFor(projectRef: string): string {
  return path.join(storeDir(), `latest-${sanitizeRef(projectRef)}.txt`)
}

export function createProductionJobId(): string {
  return `plj_${Date.now().toString(36)}_${randomBytes(4).toString('hex')}`
}

export function buildEmptyStages(): ProductionLaunchStage[] {
  return STAGE_DEFS.map((s) => ({ id: s.id, title: s.title, status: 'pending' as const }))
}

function writeJobFile(job: ProductionLaunchJob): void {
  fs.mkdirSync(storeDir(), { recursive: true })
  const file = filePathFor(job.jobId)
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(job, null, 2), 'utf8')
  fs.renameSync(tmp, file)
  fs.writeFileSync(latestPathFor(job.projectRef), job.jobId, 'utf8')
}

function readJobFile(jobId: string): ProductionLaunchJob | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePathFor(jobId), 'utf8')) as ProductionLaunchJob
    if (!parsed?.jobId || parsed.version !== PRODUCTION_LAUNCH_JOB_VERSION) return null
    return parsed
  } catch {
    return null
  }
}

export function rememberProductionLaunchJob(job: ProductionLaunchJob): ProductionLaunchJob {
  const stored: ProductionLaunchJob = { ...job, updatedAt: new Date().toISOString() }
  jobs.set(stored.jobId, stored)
  latestByProject.set(stored.projectRef, stored.jobId)
  writeJobFile(stored)
  return stored
}

export function getProductionLaunchJob(jobId: string): ProductionLaunchJob | null {
  const id = jobId.trim()
  if (!id) return null
  const cached = jobs.get(id)
  if (cached) return cached
  const fromDisk = readJobFile(id)
  if (fromDisk) {
    jobs.set(id, fromDisk)
    latestByProject.set(fromDisk.projectRef, fromDisk.jobId)
    return fromDisk
  }
  return null
}

export function getLatestProductionLaunchJob(projectRef: string): ProductionLaunchJob | null {
  const ref = projectRef.trim()
  if (!ref) return null
  const id = latestByProject.get(ref)
  if (id) return getProductionLaunchJob(id)
  try {
    const latestId = fs.readFileSync(latestPathFor(ref), 'utf8').trim()
    return latestId ? getProductionLaunchJob(latestId) : null
  } catch {
    return null
  }
}

export function clearProductionLaunchJobsForTests(): void {
  jobs.clear()
  latestByProject.clear()
}

export function patchStage(
  job: ProductionLaunchJob,
  id: ProductionLaunchStageId,
  patch: Partial<ProductionLaunchStage>,
): ProductionLaunchJob {
  const stages = job.stages.map((s) => (s.id === id ? { ...s, ...patch } : s))
  return rememberProductionLaunchJob({ ...job, stages })
}
