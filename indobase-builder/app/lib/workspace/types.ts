/**
 * Builder workspace types — core shapes live in `@indobase/platform`.
 * Diagnostics / Build aggregates stay product-local (derive from Workspace commits).
 */

import type { BuildId, DiagnosticsId, SnapshotId } from './ids'
import type { BuildStatus } from '@indobase/platform'

export type {
  BuildStatus,
  CommandIntent,
  CommandReason,
  CommandScope,
  CommandStatus,
  FileMutation,
  MutationProposal,
  MutationSet,
  WorkspaceCommand,
  WorkspaceCommandType,
  WorkspaceSnapshot,
} from '@indobase/platform'

export type DiagnosticSource =
  | 'syntax'
  | 'import'
  | 'typescript'
  | 'eslint'
  | 'vite'
  | 'runtime'
  | 'design'
  | 'security'
  | 'dependency'

export interface WorkspaceDiagnostic {
  filePath?: string
  message: string
  line?: number
  column?: number
  source: DiagnosticSource
  code?: string
}

/** Versioned diagnostics artifact keyed to a snapshot — can evolve without new file commits. */
export interface DiagnosticsArtifact {
  id: DiagnosticsId
  snapshotId: SnapshotId
  revision: number
  diagnostics: WorkspaceDiagnostic[]
  createdAt: number
}

/** Build is its own aggregate: Snapshot → Build → Preview | Deployment. */
export interface WorkspaceBuild {
  id: BuildId
  snapshotId: SnapshotId
  status: BuildStatus
  createdAt: number
  finishedAt?: number
  error?: string
  /** Preview URL or artifact location when succeeded. */
  outputRef?: string
}
