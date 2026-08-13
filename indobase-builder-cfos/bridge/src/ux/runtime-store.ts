/**
 * Persisted workspace runtime — BusinessSpec + preview + capability phases + events.
 * In-process Map (same as BusinessSpec / production jobs). Disk artifacts are the durable preview.
 */

import { createCommand } from '@indobase/platform'
import type { CapabilityPhase } from '@indobase/platform'
import type { BusinessSpec } from './business-spec.js'
import type { PreviewStatus } from './preview-gate.js'

export type RuntimePlan = {
  appType: 'ecommerce' | 'saas' | 'landing'
  source: 'inferred' | 'explicit'
  verticalId?: string
  positioning?: string
}

export type WorkspacePreviewRecord = {
  status: PreviewStatus
  url: string | null
  artifactRef: string | null
  contentHash: string | null
  httpOk: boolean | null
}

export type WorkspaceRuntimeEvent = {
  at: string
  kind: string
  message: string
  commandId?: string
}

export type PersistedWorkspaceRuntime = {
  projectRef: string
  spec: BusinessSpec | null
  plan: RuntimePlan | null
  preview: WorkspacePreviewRecord
  capabilities: Record<string, CapabilityPhase>
  events: WorkspaceRuntimeEvent[]
  artifactHtml?: string
  artifactFiles?: Record<string, string>
  lastCommandId?: string
  updatedAt: string
}

const runtimes = new Map<string, PersistedWorkspaceRuntime>()
const pendingIntents = new Map<string, string>()

function nowIso(): string {
  return new Date().toISOString()
}

export function emptyPersistedRuntime(projectRef: string): PersistedWorkspaceRuntime {
  return {
    projectRef,
    spec: null,
    plan: null,
    preview: {
      status: 'absent',
      url: null,
      artifactRef: null,
      contentHash: null,
      httpOk: null,
    },
    capabilities: {},
    events: [],
    updatedAt: nowIso(),
  }
}

export function getWorkspaceRuntime(projectRef: string | null | undefined): PersistedWorkspaceRuntime | null {
  const key = (projectRef || '').trim()
  if (!key) return null
  return runtimes.get(key) || null
}

export function rememberWorkspaceRuntime(runtime: PersistedWorkspaceRuntime): PersistedWorkspaceRuntime {
  const key = runtime.projectRef.trim()
  const next = { ...runtime, updatedAt: nowIso() }
  runtimes.set(key, next)
  return next
}

export function patchWorkspaceRuntime(
  projectRef: string,
  patch: Partial<PersistedWorkspaceRuntime>,
): PersistedWorkspaceRuntime {
  const current = getWorkspaceRuntime(projectRef) || emptyPersistedRuntime(projectRef)
  return rememberWorkspaceRuntime({
    ...current,
    ...patch,
    projectRef,
    preview: { ...current.preview, ...(patch.preview || {}) },
    capabilities: { ...current.capabilities, ...(patch.capabilities || {}) },
    events: patch.events || current.events,
  })
}

export function appendRuntimeEvent(
  projectRef: string,
  event: Omit<WorkspaceRuntimeEvent, 'at'> & { at?: string },
): PersistedWorkspaceRuntime {
  const current = getWorkspaceRuntime(projectRef) || emptyPersistedRuntime(projectRef)
  const nextEvent: WorkspaceRuntimeEvent = {
    at: event.at || nowIso(),
    kind: event.kind,
    message: event.message,
    commandId: event.commandId,
  }
  return rememberWorkspaceRuntime({
    ...current,
    events: [...current.events, nextEvent].slice(-24),
  })
}

export function issueRuntimeCommand(
  projectRef: string,
  kind: 'runtime.create' | 'runtime.preview' | 'runtime.launch' | 'runtime.repair',
  payload: Record<string, unknown>,
) {
  const command = createCommand(kind, { projectRef, ...payload }, { projectRef })
  patchWorkspaceRuntime(projectRef, { lastCommandId: command.id })
  appendRuntimeEvent(projectRef, {
    kind,
    message: kind,
    commandId: command.id,
  })
  return command
}

export function rememberPendingIntent(projectRef: string, message: string): void {
  const key = projectRef.trim()
  const text = message.trim()
  if (!key || !text) return
  pendingIntents.set(key, text)
}

export function takePendingIntent(projectRef: string): string | null {
  const key = projectRef.trim()
  if (!key) return null
  const value = pendingIntents.get(key) || null
  if (value) pendingIntents.delete(key)
  return value
}

export function peekPendingIntent(projectRef: string): string | null {
  return pendingIntents.get(projectRef.trim()) || null
}

export function clearWorkspaceRuntimesForTests(): void {
  runtimes.clear()
  pendingIntents.clear()
}
