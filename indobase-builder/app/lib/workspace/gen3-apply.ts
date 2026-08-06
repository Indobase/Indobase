/**
 * Builder Gen 3 — durable mutation apply path.
 *
 * Ownership: MutationProposal → applyProposalsViaCommands (cloudflare-adapter)
 * → WorkspaceService commit → WorkspaceCommitted (+ related Command* events).
 *
 * ActionRunner must not own this path; it remains a WebContainer / preview adapter.
 *
 * @see docs/BUILDER-GEN3.md
 */

import {
  applyProposalsViaCommands,
  createMutationProposal,
  type AppliedProposalCommand,
  type ApplyProposalsMeta,
} from '@indobase/cloudflare-adapter';
import {
  createCommandId,
  createEventBus,
  toPlatformEvent,
  type Command,
  type CommandId,
  type PlatformEvent,
  type PlatformEventBus,
} from '@indobase/platform';
import { createScopedLogger } from '~/utils/logger';
import type { SnapshotId } from './ids';
import type {
  CommandIntent,
  CommandReason,
  CommandScope,
  MutationSet,
  WorkspaceCommandType,
  WorkspaceSnapshot,
} from './types';
import type { CommitResult, WorkspaceService } from './workspace-service';
import { workspaceService as defaultWorkspace } from './workspace-service';

const logger = createScopedLogger('gen3-apply');

export type ApplyProposalsViaWorkspaceInput = {
  /** File ops to commit (already validated / normalized preferred). */
  mutations: MutationSet;
  projectRef: string;
  workspaceId?: string;
  type?: WorkspaceCommandType;
  intent?: CommandIntent;
  scope?: CommandScope;
  reason?: CommandReason;
  goal?: string;
  actorId?: string;
  /** Defaults to workspace HEAD. */
  baseSnapshotId?: SnapshotId;
  /**
   * Reuse an already-registered working command (streaming codegen).
   * When set, CommandQueued is not re-emitted.
   */
  commandId?: string;
  workspace?: WorkspaceService;
  /** Optional platform bus for lifted events (tests / bridge). */
  platformBus?: PlatformEventBus;
};

export type ApplyProposalsViaWorkspaceResult =
  | {
      ok: true;
      snapshot: WorkspaceSnapshot;
      applied: AppliedProposalCommand[];
      platformCommands: Command[];
      platformEvents: PlatformEvent[];
    }
  | {
      ok: false;
      error: string;
      applied: AppliedProposalCommand[];
      platformCommands: Command[];
      platformEvents: PlatformEvent[];
    };

function resolveCommandId(preferred?: string): string {
  if (preferred?.trim()) {
    return preferred.trim();
  }

  return createCommandId();
}

/**
 * Map proposals through the Gen 3 adapter, then commit on Indobase Workspace.
 * Emits WorkspaceCommitted (and CommandQueued / CommandStarted when registering anew).
 */
export async function applyProposalsViaWorkspace(
  input: ApplyProposalsViaWorkspaceInput,
): Promise<ApplyProposalsViaWorkspaceResult> {
  const workspace = input.workspace ?? defaultWorkspace;
  const platformBus = input.platformBus ?? createEventBus();
  const platformEvents: PlatformEvent[] = [];

  const publishPlatform = (event: Parameters<typeof toPlatformEvent>[0]) => {
    const pe = toPlatformEvent(event, {
      projectRef: input.projectRef,
      workspaceId: input.workspaceId,
    });
    platformBus.publish(pe);
    platformEvents.push(pe);
  };

  if (!input.projectRef?.trim()) {
    return {
      ok: false,
      error: 'applyProposalsViaWorkspace requires projectRef',
      applied: [],
      platformCommands: [],
      platformEvents,
    };
  }

  if (!input.mutations.files.length) {
    return {
      ok: false,
      error: 'No file mutations to apply',
      applied: [],
      platformCommands: [],
      platformEvents,
    };
  }

  const baseSnapshotId = input.baseSnapshotId ?? workspace.headSnapshotId.get();
  const commandId = resolveCommandId(input.commandId);

  let applied: AppliedProposalCommand[];

  try {
    const proposal = createMutationProposal({
      commandId,
      baseSnapshotId,
      files: input.mutations.files,
    });

    const meta: ApplyProposalsMeta = {
      projectRef: input.projectRef,
      workspaceId: input.workspaceId,
      type: input.type,
      intent: input.intent,
      scope: input.scope,
      reason: input.reason ?? 'user',
      goal: input.goal,
      actorId: input.actorId,
    };

    applied = applyProposalsViaCommands([proposal], meta);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn(`Gen3 proposal mapping failed: ${message}`);

    return {
      ok: false,
      error: message,
      applied: [],
      platformCommands: [],
      platformEvents,
    };
  }

  if (applied.length !== 1) {
    return {
      ok: false,
      error: `Expected 1 applied proposal, got ${applied.length}`,
      applied,
      platformCommands: applied.map((a) => a.platformCommand),
      platformEvents,
    };
  }

  const row = applied[0];
  const commandIdTyped = row.workspaceCommand.id as CommandId;
  const existing = workspace.getCommand(commandIdTyped);

  // registerCommand emits CommandQueued on the workspace bus.
  if (!existing) {
    workspace.registerCommand(row.workspaceCommand);
    publishPlatform({
      type: 'CommandQueued',
      commandId: commandIdTyped,
      baseSnapshotId: row.workspaceCommand.baseSnapshotId,
      at: Date.now(),
    });
  }

  if (!existing || existing.status === 'queued') {
    workspace.markCommandStarted(commandIdTyped);
    publishPlatform({
      type: 'CommandStarted',
      commandId: commandIdTyped,
      at: Date.now(),
    });
  }

  // Align command metadata from adapter meta when reusing a working session.
  const command = workspace.getCommand(commandIdTyped);

  if (command) {
    if (input.type) {
      command.type = input.type;
    }

    if (input.intent) {
      command.intent = input.intent;
    }

    if (input.scope) {
      command.scope = input.scope;
    }

    if (input.reason) {
      command.reason = input.reason;
    }

    if (input.goal) {
      command.goal = input.goal;
    }
  }

  const result: CommitResult = await workspace.commit({
    ...row.proposal,
    commandId: commandIdTyped,
  });

  if (!result.ok) {
    logger.warn(`Gen3 workspace commit failed: ${result.error}`);

    return {
      ok: false,
      error: result.error,
      applied,
      platformCommands: [row.platformCommand],
      platformEvents,
    };
  }

  publishPlatform({
    type: 'WorkspaceCommitted',
    commandId: commandIdTyped,
    snapshotId: result.snapshot.id,
    parentSnapshotId: result.snapshot.parentId,
    version: result.snapshot.version,
    at: result.snapshot.createdAt,
  });

  logger.info(
    `Gen3 committed ${result.snapshot.id} v${result.snapshot.version} via Commands (${result.snapshot.mutations.files.length} ops)`,
  );

  return {
    ok: true,
    snapshot: result.snapshot,
    applied,
    platformCommands: [row.platformCommand],
    platformEvents,
  };
}

export type { AppliedProposalCommand, ApplyProposalsMeta };
