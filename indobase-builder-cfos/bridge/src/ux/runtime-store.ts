/**
 * Persisted workspace runtime — BusinessSpec + preview + capability phases + events.
 * In-process Map (same as BusinessSpec / production jobs). Disk artifacts are the durable preview.
 */

import fs from 'node:fs'
import path from 'node:path'

import { createCommand } from '@indobase/platform'
import type { CapabilityPhase } from '@indobase/platform'
import { deriveAgentUsername } from '../agent-credentials.js'
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
let pendingLoaded = false

function pendingStorePath(): string {
  const root =
    process.env.INDOBASE_LAUNCH_ROOT?.trim() || path.join(process.cwd(), '.indobase-launches')
  return path.join(root, 'pending-intents.json')
}

function loadPendingIntents(): void {
  if (pendingLoaded) return
  pendingLoaded = true
  try {
    const raw = fs.readFileSync(pendingStorePath(), 'utf8')
    const parsed = JSON.parse(raw) as { intents?: Record<string, string> }
    if (parsed?.intents && typeof parsed.intents === 'object') {
      for (const [key, value] of Object.entries(parsed.intents)) {
        if (key && typeof value === 'string' && value.trim()) pendingIntents.set(key, value)
      }
    }
  } catch {
    /* missing file is fine */
  }
}

function persistPendingIntents(): void {
  try {
    const file = pendingStorePath()
    fs.mkdirSync(path.dirname(file), { recursive: true })
    const intents: Record<string, string> = {}
    for (const [key, value] of pendingIntents.entries()) intents[key] = value
    fs.writeFileSync(file, `${JSON.stringify({ version: 1, intents }, null, 2)}\n`)
  } catch {
    /* disk is best-effort; in-memory still works in-process */
  }
}

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
  loadPendingIntents()
  const key = projectRef.trim()
  const text = message.trim()
  if (!key || !text) return
  pendingIntents.set(key, text)
  persistPendingIntents()
}

export function rememberPendingIntentForSession(
  session: { projectRef: string; gotrueId?: string; cfosBindProjectRef?: string },
  message: string,
  agentUsername?: string | null,
): void {
  const text = (message || '').trim()
  if (!text) return
  rememberPendingIntent(session.projectRef, text)
  const bind = (session.cfosBindProjectRef || '').trim()
  if (bind && bind !== session.projectRef.trim()) rememberPendingIntent(`bind:${bind}`, text)
  const username =
    (agentUsername || '').trim() ||
    (session.gotrueId && session.projectRef
      ? deriveAgentUsername(session.gotrueId, session.projectRef)
      : '')
  if (username) rememberPendingIntent(`agent:${username}`, text)
}

export function takePendingIntent(projectRef: string): string | null {
  loadPendingIntents()
  const key = projectRef.trim()
  if (!key) return null
  const value = pendingIntents.get(key) || null
  if (value) {
    pendingIntents.delete(key)
    persistPendingIntents()
  }
  return value
}

export function takePendingAcrossAuth(keys: Array<string | null | undefined>): string | null {
  loadPendingIntents()
  let found: string | null = null
  for (const raw of keys) {
    const key = (raw || '').trim()
    if (!key) continue
    const value = pendingIntents.get(key)
    if (value) {
      if (!found) found = value
      pendingIntents.delete(key)
    }
  }
  if (found) persistPendingIntents()
  return found
}

export function peekPendingIntent(projectRef: string | null | undefined): string | null {
  loadPendingIntents()
  const key = (projectRef || '').trim()
  if (!key) return null
  return pendingIntents.get(key) || pendingIntents.get(`bind:${key}`) || pendingIntents.get(`agent:${key}`) || null
}

export function clearWorkspaceRuntimesForTests(): void {
  runtimes.clear()
  pendingIntents.clear()
  pendingLoaded = true
}
