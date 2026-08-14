/**
 * Durable ProductionLaunchJob store (per jobId + latest-by-project).
 */

import fs from 'node:fs'
import path from 'node:path'
import { randomBytes } from 'node:crypto'

import type { BackendConfig } from '../auth.js'
import { PRODUCTION_JOB_STAGE_TITLES, businessJobStageTitle } from '../ux-conductor.js'
import { planProductionApp, type ApplicationPlan, type ProductionAppType } from './application-planner.js'
import { resolveProductionContract, type ProductionApplicationContract } from './production-contract.js'
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
  frozenArtifactHash?: string
  publishedArtifactHash?: string
  liveArtifactHash?: string
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

const STAGE_IDS = Object.keys(PRODUCTION_JOB_STAGE_TITLES) as ProductionLaunchStageId[]

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

export function buildEmptyStages(appType?: string | null): ProductionLaunchStage[] {
  return STAGE_IDS.map((id) => ({
    id,
    title: businessJobStageTitle(id, appType),
    status: 'pending' as const,
  }))
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

export function rememberLivePublishJob(input: {
  projectRef: string
  url: string
  gotrueId?: string
  email?: string
  html?: string
  files?: Record<string, string>
  title?: string
  brand?: string
  intent?: string
  appType?: string | null
}): ProductionLaunchJob {
  const existing = getLatestProductionLaunchJob(input.projectRef)
  if (existing?.status === 'live' && existing.url === input.url && existing.claim_live) {
    return rememberProductionLaunchJob({
      ...existing,
      html: input.html || existing.html,
      files: input.files || existing.files,
      title: input.title || existing.title,
      url: input.url,
    })
  }
  const plan = existing?.plan || planProductionApp({ appType: input.appType, intent: input.intent || input.title })
  const contract = existing?.contract || resolveProductionContract(plan.appType)
  const now = new Date().toISOString()
  const stages = (existing?.stages || buildEmptyStages(plan.appType)).map((s) => ({
    ...s,
    status: 'ok' as const,
    finishedAt: s.finishedAt || now,
  }))
  return rememberProductionLaunchJob({
    version: PRODUCTION_LAUNCH_JOB_VERSION,
    jobId: existing?.jobId || createProductionJobId(),
    projectRef: input.projectRef,
    gotrueId: input.gotrueId || existing?.gotrueId || '',
    email: input.email || existing?.email || '',
    intent: input.intent || existing?.intent || input.title || '',
    production: true,
    appType: plan.appType,
    plan,
    contract,
    status: 'live',
    stages,
    html: input.html || existing?.html,
    files: input.files || existing?.files,
    title: input.title || existing?.title,
    brand: input.brand || existing?.brand,
    url: input.url,
    claim_live: true,
    repairAttempts: existing?.repairAttempts || 0,
    failures: existing?.failures || [],
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  })
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
