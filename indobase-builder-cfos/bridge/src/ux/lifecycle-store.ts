/**
 * ApplicationLifecycleRecord persisted beside workspace runtime.
 * Presentation and chat must read this; they must not invent LIVE.
 */

import {
  applyLifecycleTransition,
  emptyApplicationLifecycle,
  type ApplicationLifecycleRecord,
  type ApplicationLifecycleStateName,
} from '../../../../packages/platform/src/business/lifecycle.ts'

import { persistGen3Record, loadGen3Record } from './gen3-durable.js'

const records = new Map<string, ApplicationLifecycleRecord>()

export function getApplicationLifecycle(projectRef: string): ApplicationLifecycleRecord {
  const ref = (projectRef || '').trim()
  const cached = records.get(ref)
  if (cached) return cached
  const disk = loadGen3Record<ApplicationLifecycleRecord>('lifecycle', ref)
  if (disk) {
    records.set(ref, disk)
    return disk
  }
  return emptyApplicationLifecycle(ref)
}

export function patchApplicationLifecycle(
  projectRef: string,
  to: ApplicationLifecycleStateName,
  patch: Partial<ApplicationLifecycleRecord> = {},
): ApplicationLifecycleRecord {
  const current = getApplicationLifecycle(projectRef)
  const applied = applyLifecycleTransition(current, to, patch)
  if (!applied.ok) {
    const next = {
      ...current,
      lastError: { code: 'illegal_transition', message: applied.error, stage: `${current.currentState}→${to}` },
      updatedAt: new Date().toISOString(),
    }
    records.set(projectRef, next)
    persistGen3Record('lifecycle', projectRef, next)
    return next
  }
  records.set(projectRef, applied.record)
  persistGen3Record('lifecycle', projectRef, applied.record)
  return applied.record
}

export function resetApplicationLifecycle(projectRef: string): void {
  records.delete(projectRef)
}
