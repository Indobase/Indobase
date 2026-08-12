/**
 * Map CFOS runtime usernames (ib_…) → Indobase session principals.
 * Written when the browser fetches /api/os/runtime/agent-credentials.
 * Used by the CFOS launchBusiness AgentTool (workerd has no session cookies).
 */
import fs from 'node:fs/promises'
import path from 'node:path'

import type { BackendConfig } from './auth.js'

/** Latest tenant keys from ensure* — lets agent-tool sessions use real REST/Auth. */
export type AgentPrincipalBackendSnapshot = Pick<
  BackendConfig,
  | 'api_url'
  | 'anon_key'
  | 'auth_url'
  | 'rest_url'
  | 'storage_url'
  | 'project_ref'
  | 'project_name'
  | 'public_env'
>

export type AgentPrincipalRecord = {
  username: string
  gotrueId: string
  projectRef: string
  email: string
  guest: boolean
  projectName?: string
  backend?: AgentPrincipalBackendSnapshot
  updatedAt: string
}

type StoreFile = {
  version: 1
  principals: Record<string, AgentPrincipalRecord>
}

function storePath(): string {
  const root =
    process.env.INDOBASE_AGENT_PRINCIPAL_DIR?.trim() ||
    process.env.INDOBASE_LAUNCH_ROOT?.trim() ||
    path.join(process.cwd(), '.indobase-launches')
  return path.join(root, 'agent-principals.json')
}

async function readStore(): Promise<StoreFile> {
  try {
    const raw = await fs.readFile(storePath(), 'utf8')
    const parsed = JSON.parse(raw) as StoreFile
    if (!parsed || parsed.version !== 1 || typeof parsed.principals !== 'object') {
      return { version: 1, principals: {} }
    }
    return parsed
  } catch {
    return { version: 1, principals: {} }
  }
}

async function writeStore(store: StoreFile): Promise<void> {
  const file = storePath()
  await fs.mkdir(path.dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`
  await fs.writeFile(tmp, JSON.stringify(store, null, 2), 'utf8')
  await fs.rename(tmp, file)
}

export async function rememberAgentPrincipal(
  record: Omit<AgentPrincipalRecord, 'updatedAt'> & { updatedAt?: string },
): Promise<void> {
  const username = record.username.trim()
  if (!username) return
  const projectRef = (record.projectRef || '').trim()
  if (!projectRef) return
  const store = await readStore()
  const existing = store.principals[username]
  // Never clobber a verified member principal with a guest rewrite for the same CFOS
  // username (OTP verify upgrades ib_* → member; a later guest cookie credentials pull
  // must not flip guest back to true before claim-session).
  const incomingGuest = Boolean(record.guest)
  if (existing && !existing.guest && incomingGuest) {
    return
  }
  store.principals[username] = {
    username,
    gotrueId: record.gotrueId,
    projectRef,
    email: record.email,
    guest: incomingGuest,
    projectName: record.projectName ?? existing?.projectName,
    // Preserve ensure* backend snapshot across credential refreshes.
    backend: record.backend ?? existing?.backend,
    updatedAt: record.updatedAt || new Date().toISOString(),
  }
  await writeStore(store)
}

export async function lookupAgentPrincipal(
  username: string,
): Promise<AgentPrincipalRecord | null> {
  const key = username.trim()
  if (!key) return null
  const store = await readStore()
  return store.principals[key] || null
}

/**
 * After OTP, CFOS may still call tools as the pre-verify guest username while the
 * browser cookie is already a member. Prefer any non-guest principal for the same
 * workspace so sessionStatus does not restart signup.
 */
export async function lookupMemberPrincipalForProject(
  projectRef: string,
): Promise<AgentPrincipalRecord | null> {
  const ref = projectRef.trim()
  if (!ref || ref.startsWith('draft_')) return null
  const store = await readStore()
  let best: AgentPrincipalRecord | null = null
  for (const row of Object.values(store.principals)) {
    if (!row || row.guest) continue
    if (row.projectRef !== ref) continue
    if (!row.email?.includes('@')) continue
    if (!best || Date.parse(row.updatedAt) > Date.parse(best.updatedAt)) best = row
  }
  return best
}

function snapshotBackend(backend: BackendConfig): AgentPrincipalBackendSnapshot {
  return {
    api_url: backend.api_url,
    anon_key: backend.anon_key,
    auth_url: backend.auth_url,
    rest_url: backend.rest_url,
    storage_url: backend.storage_url,
    project_ref: backend.project_ref,
    project_name: backend.project_name,
    public_env: backend.public_env,
  }
}

/** Merge ensure* backend keys onto an existing CFOS principal (agent-tool path). */
export async function updateAgentPrincipalBackend(
  username: string,
  backend: BackendConfig,
): Promise<void> {
  const key = username.trim()
  if (!key || !backend.api_url?.trim() || !backend.anon_key?.trim()) return
  const store = await readStore()
  const existing = store.principals[key]
  if (!existing) return
  store.principals[key] = {
    ...existing,
    backend: snapshotBackend(backend),
    updatedAt: new Date().toISOString(),
  }
  await writeStore(store)
}
