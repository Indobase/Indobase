import type { BuildId, CommandId, DiagnosticsId, SnapshotId } from './ids';

/**
 * Small command taxonomy. Prefer intent/scope/reason metadata over exploding types.
 * Repair / refactor / feature edits are all ModifyWorkspace with different reason/intent.
 */
export type WorkspaceCommandType = 'GenerateProject' | 'ModifyWorkspace' | 'RunBuild' | 'PublishDeployment';

export type CommandIntent = 'scaffold' | 'ui' | 'feature' | 'architecture' | 'repair' | 'refactor' | 'build' | 'deploy';

export type CommandScope = 'single-file' | 'multi-file' | 'workspace';

/** Why the command was requested — not a separate command family. */
export type CommandReason = 'user' | 'diagnostics' | 'deployment' | 'migration' | 'optimization';

export type CommandStatus = 'queued' | 'running' | 'committed' | 'failed' | 'cancelled';

export interface WorkspaceCommand {
  id: CommandId;
  type: WorkspaceCommandType;
  intent: CommandIntent;
  scope: CommandScope;
  reason: CommandReason;
  /** Snapshot the plan was based on (may lag HEAD if concurrent commands exist). */
  baseSnapshotId: SnapshotId;
  status: CommandStatus;
  createdAt: number;
  startedAt?: number;
  finishedAt?: number;
  error?: string;
  /** Optional human/LLM goal text for context builders. */
  goal?: string;
}

/** One file change inside a delta snapshot (Git-like). */
export type FileMutation =
  | { kind: 'upsert'; path: string; content: string; isBinary?: boolean }
  | { kind: 'delete'; path: string };

export interface MutationSet {
  files: FileMutation[];
}

/**
 * Immutable delta snapshot. Reconstruct trees via parent chain + mutation sets.
 * Do not store a full project tree per snapshot.
 */
export interface WorkspaceSnapshot {
  id: SnapshotId;
  parentId: SnapshotId | null;
  commandId: CommandId;
  mutations: MutationSet;
  createdAt: number;
  /** Monotonic version within a workspace session (1 = first commit). */
  version: number;
}

export type DiagnosticSource = 'syntax' | 'import' | 'typescript' | 'eslint' | 'vite' | 'runtime' | 'design' | 'security' | 'dependency';

export interface WorkspaceDiagnostic {
  filePath?: string;
  message: string;
  line?: number;
  column?: number;
  source: DiagnosticSource;
  code?: string;
}

/** Versioned diagnostics artifact keyed to a snapshot — can evolve without new file commits. */
export interface DiagnosticsArtifact {
  id: DiagnosticsId;
  snapshotId: SnapshotId;
  revision: number;
  diagnostics: WorkspaceDiagnostic[];
  createdAt: number;
}

export type BuildStatus = 'queued' | 'running' | 'succeeded' | 'failed';

/** Build is its own aggregate: Snapshot → Build → Preview | Deployment. */
export interface WorkspaceBuild {
  id: BuildId;
  snapshotId: SnapshotId;
  status: BuildStatus;
  createdAt: number;
  finishedAt?: number;
  error?: string;
  /** Preview URL or artifact location when succeeded. */
  outputRef?: string;
}

/** Proposal from an executor — Workspace validates and commits; executors do not write durable state. */
export interface MutationProposal {
  commandId: CommandId;
  baseSnapshotId: SnapshotId;
  mutations: MutationSet;
}
