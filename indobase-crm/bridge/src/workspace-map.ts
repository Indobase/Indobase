/**
 * Durable org → Twenty workspace mapping (invite hash + workspace id).
 *
 * Tenant boundary is the Indobase organization (`teamKey` / org slug).
 * Persisted as JSON on a bridge volume so later SSO handoffs join the right
 * workspace instead of a single global invite hash.
 */
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

export type OrgWorkspaceRecord = {
  orgSlug: string
  teamKey: string
  workspaceId: string
  inviteHash: string
  subdomain: string
  displayName: string
  createdAt: string
}

export type WorkspaceMapStore = {
  version: 1
  byTeamKey: Record<string, OrgWorkspaceRecord>
}

const DEFAULT_PATH = '/var/lib/indobase-crm/workspace-map.json'

export function resolveWorkspaceMapPath(): string {
  const fromEnv = (process.env.CRM_WORKSPACE_MAP_PATH || '').trim()
  return fromEnv || DEFAULT_PATH
}

function emptyStore(): WorkspaceMapStore {
  return { version: 1, byTeamKey: {} }
}

export function loadWorkspaceMap(path = resolveWorkspaceMapPath()): WorkspaceMapStore {
  try {
    const raw = readFileSync(path, 'utf8')
    const parsed = JSON.parse(raw) as WorkspaceMapStore
    if (!parsed || parsed.version !== 1 || typeof parsed.byTeamKey !== 'object' || !parsed.byTeamKey) {
      return emptyStore()
    }
    return parsed
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code
    if (code === 'ENOENT') return emptyStore()
    console.error('[crm] workspace-map load failed:', err)
    return emptyStore()
  }
}

export function getOrgWorkspace(
  teamKey: string,
  path = resolveWorkspaceMapPath(),
): OrgWorkspaceRecord | null {
  const key = teamKey.trim()
  if (!key) return null
  return loadWorkspaceMap(path).byTeamKey[key] ?? null
}

export function countMappedWorkspaces(path = resolveWorkspaceMapPath()): number {
  return Object.keys(loadWorkspaceMap(path).byTeamKey).length
}

export function saveOrgWorkspace(
  record: OrgWorkspaceRecord,
  path = resolveWorkspaceMapPath(),
): OrgWorkspaceRecord {
  const store = loadWorkspaceMap(path)
  const next: OrgWorkspaceRecord = {
    ...record,
    orgSlug: record.orgSlug.trim(),
    teamKey: record.teamKey.trim(),
    workspaceId: record.workspaceId.trim(),
    inviteHash: record.inviteHash.trim(),
    subdomain: record.subdomain.trim(),
    displayName: record.displayName.trim(),
    createdAt: record.createdAt || new Date().toISOString(),
  }
  if (!next.teamKey || !next.workspaceId || !next.inviteHash) {
    throw new Error('Invalid org workspace mapping (missing teamKey, workspaceId, or inviteHash)')
  }
  store.byTeamKey[next.teamKey] = next
  mkdirSync(dirname(path), { recursive: true })
  const tmp = `${path}.${process.pid}.${Date.now()}.tmp`
  writeFileSync(tmp, `${JSON.stringify(store, null, 2)}\n`, 'utf8')
  renameSync(tmp, path)
  return next
}
