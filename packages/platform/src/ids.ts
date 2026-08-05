/** Branded id helpers — shared across all seven contracts. */

let seq = 0

function nextSuffix(): string {
  seq += 1
  const g = globalThis as { crypto?: { randomUUID?: () => string } }
  const rand =
    typeof g.crypto?.randomUUID === 'function'
      ? g.crypto.randomUUID().slice(0, 8)
      : `${Date.now()}`
  return `${Date.now().toString(36)}-${seq.toString(36)}-${rand}`
}

export type OrganizationId = string & { readonly __brand: 'OrganizationId' }
export type ProjectRef = string & { readonly __brand: 'ProjectRef' }
export type UserId = string & { readonly __brand: 'UserId' }
export type AgentId = string & { readonly __brand: 'AgentId' }
export type WorkspaceId = string & { readonly __brand: 'WorkspaceId' }
export type DocumentId = string & { readonly __brand: 'DocumentId' }
export type CommandId = string & { readonly __brand: 'CommandId' }
export type SnapshotId = string & { readonly __brand: 'SnapshotId' }
export type ExecutionId = string & { readonly __brand: 'ExecutionId' }
export type BuildId = string & { readonly __brand: 'BuildId' }
export type DiagnosticsId = string & { readonly __brand: 'DiagnosticsId' }

export function asProjectRef(ref: string): ProjectRef {
  return ref as ProjectRef
}

export function createCommandId(): CommandId {
  return `cmd_${nextSuffix()}` as CommandId
}

export function createSnapshotId(): SnapshotId {
  return `snap_${nextSuffix()}` as SnapshotId
}

export function createWorkspaceId(kind = 'ws'): WorkspaceId {
  return `ws_${kind}_${nextSuffix()}` as WorkspaceId
}

export function createDocumentId(kind = 'doc'): DocumentId {
  return `doc_${kind}_${nextSuffix()}` as DocumentId
}

export function createExecutionId(): ExecutionId {
  return `exec_${nextSuffix()}` as ExecutionId
}

export function createBuildId(): BuildId {
  return `build_${nextSuffix()}` as BuildId
}

export function createDiagnosticsId(snapshotId: SnapshotId, revision = 1): DiagnosticsId {
  return `diag_${snapshotId}_${revision}` as DiagnosticsId
}

/** Stable empty-tree root — every workspace starts from this parent. */
export const EMPTY_SNAPSHOT_ID = 'snap_empty' as SnapshotId
