/**
 * MutationProposal → Indobase workspace Commands.
 * Agent executors propose; Workspace commits. Never write durable trees from the runtime.
 */

import {
  createCommand,
  createWorkspaceCommand,
  toPlatformCommand,
  validateMutationSet,
  type Command,
  type CommandIntent,
  type CommandReason,
  type CommandScope,
  type MutationProposal,
  type MutationSet,
  type SnapshotId,
  type WorkspaceCommand,
  type WorkspaceCommandType,
} from '@indobase/platform'

export type ApplyProposalsMeta = {
  projectRef: string
  workspaceId?: string
  /** Defaults to ModifyWorkspace for non-empty trees; GenerateProject when intent is scaffold. */
  type?: WorkspaceCommandType
  intent?: CommandIntent
  reason?: CommandReason
  scope?: CommandScope
  goal?: string
  actorId?: string
}

export type AppliedProposalCommand = {
  proposal: MutationProposal
  workspaceCommand: WorkspaceCommand
  platformCommand: Command
}

/**
 * Validate proposals and map each to a Workspace + platform Command envelope.
 * Does not commit snapshots — callers (WorkspaceService / future Gen-3 commit path) own that.
 */
export function applyProposalsViaCommands(
  proposals: readonly MutationProposal[],
  meta: ApplyProposalsMeta,
): AppliedProposalCommand[] {
  if (!meta.projectRef?.trim()) {
    throw new Error('applyProposalsViaCommands requires projectRef')
  }
  if (!proposals.length) {
    return []
  }

  const out: AppliedProposalCommand[] = []

  for (const proposal of proposals) {
    const mutations: MutationSet = {
      files: proposal.mutations.files.map((f) =>
        f.kind === 'delete'
          ? { kind: 'delete' as const, path: f.path }
          : {
              kind: 'upsert' as const,
              path: f.path,
              content: f.content,
              isBinary: f.isBinary,
            },
      ),
    }

    const validationError = validateMutationSet(mutations)
    if (validationError) {
      throw new Error(`Invalid MutationProposal: ${validationError}`)
    }

    const intent = meta.intent ?? 'feature'
    const type: WorkspaceCommandType =
      meta.type ?? (intent === 'scaffold' ? 'GenerateProject' : 'ModifyWorkspace')
    const scope =
      meta.scope ??
      (mutations.files.length <= 1 ? 'single-file' : 'multi-file')

    const workspaceCommand = createWorkspaceCommand({
      type,
      intent,
      scope,
      reason: meta.reason ?? 'user',
      baseSnapshotId: proposal.baseSnapshotId,
      goal: meta.goal,
      id: typeof proposal.commandId === 'string' ? (proposal.commandId as WorkspaceCommand['id']) : undefined,
    })

    // Prefer proposal.commandId when it is already a CommandId-shaped string.
    if (proposal.commandId && workspaceCommand.id !== proposal.commandId) {
      workspaceCommand.id = proposal.commandId as WorkspaceCommand['id']
    }

    const platformCommand = toPlatformCommand(workspaceCommand, meta.projectRef)
    // Attach mutation set on the envelope payload for commit adapters (Phase 2 Workspace).
    const withMutations = createCommand(
      platformCommand.kind,
      {
        ...(platformCommand.payload as Record<string, unknown>),
        mutations,
        proposalCommandId: proposal.commandId,
      },
      {
        projectRef: meta.projectRef,
        workspaceId: meta.workspaceId,
        baseSnapshotId: proposal.baseSnapshotId,
        actor: meta.actorId
          ? { kind: 'agent', agentId: meta.actorId }
          : undefined,
      },
    )
    // Preserve workspace command id for correlation.
    const correlated: Command = { ...withMutations, id: workspaceCommand.id }

    out.push({
      proposal: { ...proposal, mutations },
      workspaceCommand,
      platformCommand: correlated,
    })
  }

  return out
}

/** Convenience alias matching ADR naming. */
export const proposalsToWorkspaceCommands = applyProposalsViaCommands

/** Build a MutationProposal from raw file ops (agent runtime → Indobase). */
export function createMutationProposal(input: {
  commandId: string
  baseSnapshotId: SnapshotId | string
  files: MutationSet['files']
}): MutationProposal {
  const mutations: MutationSet = { files: [...input.files] }
  const err = validateMutationSet(mutations)
  if (err) throw new Error(err)
  return {
    commandId: input.commandId,
    baseSnapshotId: input.baseSnapshotId as SnapshotId,
    mutations,
  }
}

/** Re-export platform type — single import path for adapters. */
export type { MutationProposal }
