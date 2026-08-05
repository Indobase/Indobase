import type { PlatformActor } from '../identity'
import type { CommandId, ProjectRef, SnapshotId, WorkspaceId } from '../ids'
import { EMPTY_SNAPSHOT_ID, createCommandId, createWorkspaceId } from '../ids'
import { createCommand, type Command } from '../commands'

/**
 * Workspace — live working session (Builder, Design, Marketing, CRM, …).
 * Services (commit / scheduler) stay in products; types + validation live here.
 */

export type WorkspaceKind = 'builder' | 'design' | 'marketing' | 'crm' | 'workflow' | (string & {})

export type Workspace = {
  id: WorkspaceId
  kind: WorkspaceKind
  projectRef?: ProjectRef | string
  actor?: PlatformActor
  headSnapshotId: SnapshotId
  createdAt: number
}

export type WorkspaceRef = {
  id: string
  projectRef?: string
}

/** @deprecated Prefer WorkspaceSessionCommands — kept for Gen-1 stubs. */
export type WorkspaceCommandKind =
  | 'workspace.writeFile'
  | 'workspace.deleteFile'
  | 'workspace.applySnapshot'
  | (string & {})

export type WorkspaceContract = {
  ref: WorkspaceRef
}

/**
 * Builder session command taxonomy (product language).
 * Prefer intent/scope/reason metadata over exploding types.
 */
export type WorkspaceCommandType =
  | 'GenerateProject'
  | 'ModifyWorkspace'
  | 'RunBuild'
  | 'PublishDeployment'

export type CommandIntent =
  | 'scaffold'
  | 'ui'
  | 'feature'
  | 'architecture'
  | 'repair'
  | 'refactor'
  | 'build'
  | 'deploy'

export type CommandScope = 'single-file' | 'multi-file' | 'workspace'

/** Why the command was requested — not a separate command family. */
export type CommandReason = 'user' | 'diagnostics' | 'deployment' | 'migration' | 'optimization'

export type CommandStatus = 'queued' | 'running' | 'committed' | 'failed' | 'cancelled'

export type BuildStatus = 'queued' | 'running' | 'succeeded' | 'failed'

export type WorkspaceCommand = {
  id: CommandId
  type: WorkspaceCommandType
  intent: CommandIntent
  scope: CommandScope
  reason: CommandReason
  /** Snapshot the plan was based on (may lag HEAD if concurrent commands exist). */
  baseSnapshotId: SnapshotId
  status: CommandStatus
  createdAt: number
  startedAt?: number
  finishedAt?: number
  error?: string
  /** Optional human/LLM goal text for context builders. */
  goal?: string
}

/** One file change inside a delta snapshot (Git-like). */
export type FileMutation =
  | { kind: 'upsert'; path: string; content: string; isBinary?: boolean }
  | { kind: 'delete'; path: string }

export type MutationSet = {
  files: FileMutation[]
}

/**
 * Immutable delta snapshot. Reconstruct trees via parent chain + mutation sets.
 * Do not store a full project tree per snapshot.
 */
export type WorkspaceSnapshot = {
  id: SnapshotId
  parentId: SnapshotId | null
  commandId: CommandId | string
  mutations: MutationSet
  createdAt: number
  /** Monotonic version within a workspace session (1 = first commit). */
  version: number
}

/** Proposal from an executor — Workspace validates and commits; executors do not write durable state. */
export type MutationProposal = {
  commandId: CommandId | string
  baseSnapshotId: SnapshotId
  mutations: MutationSet
}

/** Map Builder session command types → OS command kinds. */
export const BUILDER_COMMAND_TO_KIND = {
  GenerateProject: 'workspace.generate',
  ModifyWorkspace: 'workspace.modify',
  RunBuild: 'execution.build',
  PublishDeployment: 'execution.publish',
} as const satisfies Record<WorkspaceCommandType, string>

export type WorkspaceOsCommandKind = (typeof BUILDER_COMMAND_TO_KIND)[WorkspaceCommandType]

/** OS command constructors for workspace mutations (Execution kinds live in execution/). */
export const WorkspaceSessionCommands = {
  generate: (projectRef: string, meta: { intent?: CommandIntent; reason?: CommandReason; goal?: string } = {}) =>
    createCommand('workspace.generate' as const, {
      projectRef,
      intent: meta.intent ?? 'scaffold',
      reason: meta.reason ?? 'user',
      goal: meta.goal,
    }),
  modify: (projectRef: string, meta: { intent?: CommandIntent; reason?: CommandReason; goal?: string } = {}) =>
    createCommand('workspace.modify' as const, {
      projectRef,
      intent: meta.intent ?? 'feature',
      reason: meta.reason ?? 'user',
      goal: meta.goal,
    }),
} as const

export function createWorkspaceCommand(input: {
  type: WorkspaceCommandType
  intent: CommandIntent
  scope: CommandScope
  reason: CommandReason
  baseSnapshotId: SnapshotId
  goal?: string
  id?: CommandId
}): WorkspaceCommand {
  return {
    id: input.id ?? createCommandId(),
    type: input.type,
    intent: input.intent,
    scope: input.scope,
    reason: input.reason,
    baseSnapshotId: input.baseSnapshotId,
    status: 'queued',
    createdAt: Date.now(),
    goal: input.goal,
  }
}

/** Wrap a Builder session command as a platform Command envelope. */
export function toPlatformCommand(
  cmd: WorkspaceCommand,
  projectRef?: string,
): Command<WorkspaceOsCommandKind, {
  projectRef?: string
  intent: CommandIntent
  reason: CommandReason
  scope: CommandScope
  goal?: string
  baseSnapshotId: SnapshotId
}> {
  const envelope = createCommand(
    BUILDER_COMMAND_TO_KIND[cmd.type],
    {
      projectRef,
      intent: cmd.intent,
      reason: cmd.reason,
      scope: cmd.scope,
      goal: cmd.goal,
      baseSnapshotId: cmd.baseSnapshotId,
    },
    { projectRef, baseSnapshotId: cmd.baseSnapshotId },
  )
  return { ...envelope, id: cmd.id }
}

/** Normalize workbench / WC paths to project-relative keys. */
export function normalizeProjectPath(filePath: string): string {
  return filePath
    .replace(/\\/g, '/')
    .replace(/^\/home\/project\/?/, '')
    .replace(/^\/+/, '')
    .replace(/\/{2,}/g, '/')
}

/**
 * Validate + normalize a mutation set in place.
 * Returns an error string, or undefined when valid.
 */
export function validateMutationSet(mutations: MutationSet): string | undefined {
  if (!mutations?.files || !Array.isArray(mutations.files)) {
    return 'Mutation set must include files[]'
  }

  const seen = new Set<string>()
  const normalizedFiles: MutationSet['files'] = []

  for (const mutation of mutations.files) {
    if (!mutation?.path?.trim()) {
      return 'Mutation is missing path'
    }

    const path = normalizeProjectPath(mutation.path)

    if (!path) {
      return `Rejected path: ${mutation.path}`
    }

    if (path.split('/').includes('..')) {
      return `Rejected path: ${mutation.path}`
    }

    if (seen.has(path)) {
      return `Duplicate path in mutation set: ${path}`
    }

    seen.add(path)

    if (mutation.kind === 'upsert' && typeof mutation.content !== 'string') {
      return `Upsert for ${path} is missing content`
    }

    normalizedFiles.push(
      mutation.kind === 'delete'
        ? { kind: 'delete', path }
        : { kind: 'upsert', path, content: mutation.content, isBinary: mutation.isBinary },
    )
  }

  mutations.files = normalizedFiles

  return undefined
}

export function createWorkspace(input: {
  kind: WorkspaceKind
  projectRef?: string
  actor?: PlatformActor
}): Workspace {
  return {
    id: createWorkspaceId(input.kind),
    kind: input.kind,
    projectRef: input.projectRef,
    actor: input.actor,
    headSnapshotId: EMPTY_SNAPSHOT_ID,
    createdAt: Date.now(),
  }
}
