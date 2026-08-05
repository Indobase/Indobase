/** Opaque id helpers — concurrent-safe; do not assume a single active command. */

let seq = 0;

function nextSuffix(): string {
  seq += 1;
  const rand = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID().slice(0, 8) : `${Date.now()}`;

  return `${Date.now().toString(36)}-${seq.toString(36)}-${rand}`;
}

export type CommandId = string & { readonly __brand: 'CommandId' };
export type SnapshotId = string & { readonly __brand: 'SnapshotId' };
export type BuildId = string & { readonly __brand: 'BuildId' };
export type DiagnosticsId = string & { readonly __brand: 'DiagnosticsId' };

export function createCommandId(): CommandId {
  return `cmd_${nextSuffix()}` as CommandId;
}

export function createSnapshotId(): SnapshotId {
  return `snap_${nextSuffix()}` as SnapshotId;
}

export function createBuildId(): BuildId {
  return `build_${nextSuffix()}` as BuildId;
}

export function createDiagnosticsId(snapshotId: SnapshotId, revision = 1): DiagnosticsId {
  return `diag_${snapshotId}_${revision}` as DiagnosticsId;
}

/** Stable empty-tree root — every workspace starts from this parent. */
export const EMPTY_SNAPSHOT_ID = 'snap_empty' as SnapshotId;
