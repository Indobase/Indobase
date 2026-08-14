/**
 * Application lifecycle — evidence-gated. LIVE is never inferred from job.status.
 *
 * DRAFT → BUILDING → PREVIEW_READY → VERIFYING → VERIFIED → LAUNCHING → LIVE
 * MODIFYING returns to PREVIEW_READY. PREVIEW_READY must not jump to LIVE.
 */

export const APPLICATION_LIFECYCLE_STATES = [
  'draft',
  'building',
  'preview_ready',
  'modifying',
  'verifying',
  'verified',
  'launching',
  'live',
  'degraded',
  'failed',
] as const

export type ApplicationLifecycleStateName = (typeof APPLICATION_LIFECYCLE_STATES)[number]

/** @deprecated use ApplicationLifecycleStateName */
export type ApplicationLifecycleState = ApplicationLifecycleStateName

export type ApplicationLifecycleRecord = {
  projectRef: string
  applicationId: string
  generationId: string
  artifactId?: string
  artifactHash?: string
  previewId?: string
  previewUrl?: string
  previewStatus: 'not_ready' | 'building' | 'ready' | 'failed'
  verificationStatus: 'not_run' | 'running' | 'passed' | 'failed'
  launchStatus: 'not_started' | 'running' | 'live' | 'failed'
  liveUrl?: string
  liveArtifactHash?: string
  liveVerifiedAt?: string
  currentState: ApplicationLifecycleStateName
  lastError?: { code: string; message: string; stage: string }
  revision: number
  createdAt: string
  updatedAt: string
}

const ALLOWED: Record<ApplicationLifecycleStateName, ApplicationLifecycleStateName[]> = {
  draft: ['building', 'failed'],
  building: ['preview_ready', 'failed'],
  preview_ready: ['modifying', 'verifying', 'failed'],
  modifying: ['preview_ready', 'failed'],
  verifying: ['verified', 'failed', 'degraded', 'preview_ready'],
  verified: ['launching', 'modifying', 'failed'],
  launching: ['live', 'failed', 'degraded'],
  live: ['modifying', 'degraded'],
  degraded: ['verifying', 'failed'],
  failed: ['draft', 'building', 'verifying', 'launching'],
}

export function canTransitionLifecycle(
  from: ApplicationLifecycleStateName,
  to: ApplicationLifecycleStateName,
): boolean {
  if (from === to) return true
  return (ALLOWED[from] || []).includes(to)
}

export function lifecycleAllowsLiveSpeech(state: ApplicationLifecycleStateName): boolean {
  return state === 'live'
}

export function emptyApplicationLifecycle(
  projectRef: string,
  now = new Date().toISOString(),
): ApplicationLifecycleRecord {
  const ref = projectRef.trim()
  return {
    projectRef: ref,
    applicationId: ref,
    generationId: `gen_${ref || 'none'}`,
    previewStatus: 'not_ready',
    verificationStatus: 'not_run',
    launchStatus: 'not_started',
    currentState: 'draft',
    revision: 0,
    createdAt: now,
    updatedAt: now,
  }
}

export function assertLifecycleTransition(
  from: ApplicationLifecycleStateName,
  to: ApplicationLifecycleStateName,
): { ok: true } | { ok: false; error: string } {
  if (canTransitionLifecycle(from, to)) return { ok: true }
  return { ok: false, error: `illegal_lifecycle_transition:${from}→${to}` }
}

export function applyLifecycleTransition(
  record: ApplicationLifecycleRecord,
  to: ApplicationLifecycleStateName,
  patch: Partial<ApplicationLifecycleRecord> = {},
  now = new Date().toISOString(),
): { ok: true; record: ApplicationLifecycleRecord } | { ok: false; error: string; record: ApplicationLifecycleRecord } {
  const gate = assertLifecycleTransition(record.currentState, to)
  if (!gate.ok) return { ok: false, error: gate.error, record }
  const next: ApplicationLifecycleRecord = {
    ...record,
    ...patch,
    projectRef: record.projectRef,
    applicationId: patch.applicationId || record.applicationId,
    generationId: patch.generationId || record.generationId,
    currentState: to,
    revision: record.revision + 1,
    updatedAt: now,
    createdAt: record.createdAt,
  }
  if (to === 'preview_ready') next.previewStatus = 'ready'
  if (to === 'building') next.previewStatus = 'building'
  if (to === 'verifying') next.verificationStatus = 'running'
  if (to === 'verified') next.verificationStatus = 'passed'
  if (to === 'launching') next.launchStatus = 'running'
  if (to === 'live') {
    next.launchStatus = 'live'
    next.liveArtifactHash = next.artifactHash
    next.liveVerifiedAt = now
  }
  if (to === 'failed') {
    if (record.currentState === 'building' || record.currentState === 'modifying') next.previewStatus = 'failed'
    if (record.currentState === 'verifying') next.verificationStatus = 'failed'
    if (record.currentState === 'launching') next.launchStatus = 'failed'
  }
  return { ok: true, record: next }
}
