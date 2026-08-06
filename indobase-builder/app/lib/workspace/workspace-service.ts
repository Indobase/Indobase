import { atom, type WritableAtom } from 'nanostores';
import { createScopedLogger } from '~/utils/logger';
import { WorkspaceEventBus } from './events';
import {
  createDiagnosticsId,
  createSnapshotId,
  EMPTY_SNAPSHOT_ID,
  type CommandId,
  type DiagnosticsId,
  type SnapshotId,
} from './ids';
import {
  applyMutations,
  diffTrees,
  materializeSnapshot,
  normalizeProjectPath,
  validateMutationSet,
  type MaterializedTree,
} from './snapshot-tree';
import { createWorkspaceCommand } from '@indobase/platform';
import type {
  CommandIntent,
  CommandReason,
  CommandScope,
  DiagnosticsArtifact,
  MutationProposal,
  MutationSet,
  WorkspaceCommand,
  WorkspaceCommandType,
  WorkspaceDiagnostic,
  WorkspaceSnapshot,
} from './types';
import type { WorkingCommandSession } from './working-command';

const logger = createScopedLogger('WorkspaceService');

export type CommitResult =
  | { ok: true; snapshot: WorkspaceSnapshot }
  | { ok: false; error: string };

export type BeginWorkingCommandInput = {
  type: WorkspaceCommandType;
  intent: CommandIntent;
  scope: CommandScope;
  reason: CommandReason;
  goal?: string;
  baseSnapshotId?: SnapshotId;
};

/**
 * Workspace owns consistency: validate proposals, commit delta snapshots, emit events.
 * Executors propose mutations — they do not write durable workspace state.
 *
 * Contracts intentionally allow multiple in-flight commands (by CommandId + baseSnapshotId).
 * v1 schedulers may still run mutating commands serially.
 */
export class WorkspaceService {
  readonly events: WorkspaceEventBus;
  readonly headSnapshotId: WritableAtom<SnapshotId>;
  readonly headVersion: WritableAtom<number>;
  /** Most recently begun working command (UI convenience — not exclusive). */
  readonly activeWorkingCommandId: WritableAtom<CommandId | undefined>;

  #snapshots = new Map<SnapshotId, WorkspaceSnapshot>();
  #commands = new Map<CommandId, WorkspaceCommand>();
  #working = new Map<CommandId, WorkingCommandSession>();
  #diagnostics = new Map<DiagnosticsId, DiagnosticsArtifact>();
  #diagnosticsRevisionBySnapshot = new Map<SnapshotId, number>();
  /** Soft lock for v1 serial commits; does not forbid concurrent command ids. */
  #commitChain: Promise<unknown> = Promise.resolve();

  constructor(events?: WorkspaceEventBus) {
    this.events = events ?? new WorkspaceEventBus();
    this.headSnapshotId = atom(EMPTY_SNAPSHOT_ID);
    this.headVersion = atom(0);
    this.activeWorkingCommandId = atom<CommandId | undefined>(undefined);
  }

  getSnapshot(id: SnapshotId): WorkspaceSnapshot | undefined {
    return this.#snapshots.get(id);
  }

  getCommand(id: CommandId): WorkspaceCommand | undefined {
    return this.#commands.get(id);
  }

  getWorkingCommand(id?: CommandId): WorkingCommandSession | undefined {
    const commandId = id ?? this.activeWorkingCommandId.get();

    return commandId ? this.#working.get(commandId) : undefined;
  }

  listWorkingCommands(): WorkingCommandSession[] {
    return [...this.#working.values()];
  }

  listSnapshots(): WorkspaceSnapshot[] {
    return [...this.#snapshots.values()].sort((a, b) => a.version - b.version);
  }

  getDiagnostics(id: DiagnosticsId): DiagnosticsArtifact | undefined {
    return this.#diagnostics.get(id);
  }

  listDiagnosticsForSnapshot(snapshotId: SnapshotId): DiagnosticsArtifact[] {
    return [...this.#diagnostics.values()]
      .filter((artifact) => artifact.snapshotId === snapshotId)
      .sort((a, b) => a.revision - b.revision);
  }

  materialize(snapshotId: SnapshotId = this.headSnapshotId.get()): MaterializedTree {
    return materializeSnapshot(snapshotId, this.#snapshots);
  }

  /**
   * Open a working command. File proposals accumulate until commitWorkingCommand.
   * Multiple working commands may exist; activeWorkingCommandId tracks the latest for UI/streaming.
   */
  beginWorkingCommand(input: BeginWorkingCommandInput): WorkingCommandSession {
    const baseSnapshotId = input.baseSnapshotId ?? this.headSnapshotId.get();
    const command = createWorkspaceCommand({
      type: input.type,
      intent: input.intent,
      scope: input.scope,
      reason: input.reason,
      baseSnapshotId,
      goal: input.goal,
    });
    command.status = 'running';
    command.startedAt = Date.now();

    this.registerCommand(command);
    this.markCommandStarted(command.id);

    const session: WorkingCommandSession = {
      commandId: command.id,
      baseSnapshotId,
      type: input.type,
      intent: input.intent,
      scope: input.scope,
      reason: input.reason,
      goal: input.goal,
      workingTree: this.materialize(baseSnapshotId),
      proposalCount: 0,
      startedAt: Date.now(),
    };

    this.#working.set(command.id, session);
    this.activeWorkingCommandId.set(command.id);
    logger.debug(`Began working command ${command.id} on ${baseSnapshotId}`);

    return session;
  }

  /**
   * Propose a file upsert/delete against a working command (default: active).
   * Does not commit — streaming-safe accumulation.
   */
  proposeFileMutation(
    mutation: { kind: 'upsert'; path: string; content: string; isBinary?: boolean } | { kind: 'delete'; path: string },
    commandId?: CommandId,
  ): { ok: true; commandId: CommandId } | { ok: false; error: string } {
    let session = this.getWorkingCommand(commandId);

    if (!session) {
      // Lazy-open a ModifyWorkspace for editor/codegen writes that arrive without begin().
      session = this.beginWorkingCommand({
        type: 'ModifyWorkspace',
        intent: 'feature',
        scope: 'multi-file',
        reason: 'user',
      });
    }

    const path = normalizeProjectPath(mutation.path);

    if (!path || path.split('/').includes('..')) {
      return { ok: false, error: `Rejected path: ${mutation.path}` };
    }

    if (mutation.kind === 'delete') {
      session.workingTree = applyMutations(session.workingTree, { files: [{ kind: 'delete', path }] });
    } else {
      session.workingTree = applyMutations(session.workingTree, {
        files: [{ kind: 'upsert', path, content: mutation.content, isBinary: mutation.isBinary }],
      });
    }

    session.proposalCount += 1;

    return { ok: true, commandId: session.commandId };
  }

  /** Diff working tree vs base and commit. Clears the working session on success or failure. */
  async commitWorkingCommand(commandId?: CommandId): Promise<CommitResult> {
    const session = this.getWorkingCommand(commandId);

    if (!session) {
      return { ok: false, error: 'No working command to commit' };
    }

    const baseTree = this.materialize(session.baseSnapshotId);
    const mutations = diffTrees(baseTree, session.workingTree);
    const result = await this.commit({
      commandId: session.commandId,
      baseSnapshotId: session.baseSnapshotId,
      mutations,
    });

    this.#working.delete(session.commandId);

    if (this.activeWorkingCommandId.get() === session.commandId) {
      this.activeWorkingCommandId.set(undefined);
    }

    return result;
  }

  abandonWorkingCommand(commandId?: CommandId, error = 'abandoned'): void {
    const session = this.getWorkingCommand(commandId);

    if (!session) {
      return;
    }

    this.markCommandFailed(session.commandId, error);
    this.#working.delete(session.commandId);

    if (this.activeWorkingCommandId.get() === session.commandId) {
      this.activeWorkingCommandId.set(undefined);
    }
  }

  /**
   * Drop a working session without failing the command.
   * Used when Gen 3 handoff reuses the same CommandId for MutationProposal → commit.
   */
  clearWorkingCommand(commandId?: CommandId): void {
    const session = this.getWorkingCommand(commandId);

    if (!session) {
      return;
    }

    this.#working.delete(session.commandId);

    if (this.activeWorkingCommandId.get() === session.commandId) {
      this.activeWorkingCommandId.set(undefined);
    }
  }

  /**
   * Record versioned diagnostics for a snapshot (may evolve without a new file commit).
   * Defaults to HEAD when snapshotId omitted.
   */
  recordDiagnostics(
    diagnostics: WorkspaceDiagnostic[],
    snapshotId: SnapshotId = this.headSnapshotId.get(),
  ): DiagnosticsArtifact {
    const revision = (this.#diagnosticsRevisionBySnapshot.get(snapshotId) ?? 0) + 1;
    this.#diagnosticsRevisionBySnapshot.set(snapshotId, revision);

    const artifact: DiagnosticsArtifact = {
      id: createDiagnosticsId(snapshotId, revision),
      snapshotId,
      revision,
      diagnostics,
      createdAt: Date.now(),
    };

    this.#diagnostics.set(artifact.id, artifact);
    this.events.emit({
      type: 'DiagnosticsCompleted',
      diagnosticsId: artifact.id,
      snapshotId,
      diagnostics,
      at: artifact.createdAt,
    });

    return artifact;
  }

  registerCommand(command: WorkspaceCommand): void {
    this.#commands.set(command.id, command);
    this.events.emit({
      type: 'CommandQueued',
      commandId: command.id,
      baseSnapshotId: command.baseSnapshotId,
      at: Date.now(),
    });
  }

  markCommandStarted(commandId: CommandId): void {
    const command = this.#commands.get(commandId);

    if (!command) {
      return;
    }

    command.status = 'running';
    command.startedAt = Date.now();
    this.events.emit({ type: 'CommandStarted', commandId, at: command.startedAt });
  }

  markCommandFailed(commandId: CommandId, error: string): void {
    const command = this.#commands.get(commandId);

    if (!command) {
      return;
    }

    command.status = 'failed';
    command.error = error;
    command.finishedAt = Date.now();
    this.events.emit({ type: 'CommandFailed', commandId, error, at: command.finishedAt });
  }

  /**
   * Validate + commit a mutation proposal as an immutable delta snapshot.
   * Serialized so concurrent proposals don't interleave commits (scheduler may still queue many commands).
   */
  async commit(proposal: MutationProposal): Promise<CommitResult> {
    const run = this.#commitChain.then(() => this.#commitNow(proposal));
    this.#commitChain = run.then(
      () => undefined,
      () => undefined,
    );

    return run;
  }

  #commitNow(proposal: MutationProposal): CommitResult {
    const command = this.#commands.get(proposal.commandId);

    if (!command) {
      return { ok: false, error: `Unknown command ${proposal.commandId}` };
    }

    if (command.status === 'cancelled') {
      return { ok: false, error: `Command ${proposal.commandId} was cancelled` };
    }

    const validationError = validateMutationSet(proposal.mutations);

    if (validationError) {
      this.markCommandFailed(proposal.commandId, validationError);

      return { ok: false, error: validationError };
    }

    const head = this.headSnapshotId.get();

    /*
     * If the proposal was based on an older snapshot, rebase mutations onto HEAD when possible.
     * Conflict = same path changed in both the proposal and HEAD-since-base.
     */
    let mutations = proposal.mutations;
    const baseId = proposal.baseSnapshotId;

    if (baseId !== head && head !== EMPTY_SNAPSHOT_ID) {
      const rebased = rebaseMutations({
        baseId,
        headId: head,
        mutations: proposal.mutations,
        snapshots: this.#snapshots,
      });

      if (!rebased.ok) {
        this.markCommandFailed(proposal.commandId, rebased.error);

        return rebased;
      }

      mutations = rebased.mutations;
    }

    if (mutations.files.length === 0) {
      // Empty commit still advances command to committed against current head (idempotent finalize).
      command.status = 'committed';
      command.finishedAt = Date.now();
      const existing = head === EMPTY_SNAPSHOT_ID ? null : this.#snapshots.get(head);

      if (existing) {
        this.events.emit({
          type: 'WorkspaceCommitted',
          commandId: proposal.commandId,
          snapshotId: existing.id,
          parentSnapshotId: existing.parentId,
          version: existing.version,
          at: Date.now(),
        });

        return { ok: true, snapshot: existing };
      }
    }

    const parentId = head === EMPTY_SNAPSHOT_ID ? null : head;
    const version = this.headVersion.get() + 1;
    const snapshot: WorkspaceSnapshot = {
      id: createSnapshotId(),
      parentId: parentId ?? EMPTY_SNAPSHOT_ID,
      commandId: proposal.commandId,
      mutations,
      createdAt: Date.now(),
      version,
    };

    // Ensure parent pointer uses EMPTY sentinel for first commit.
    if (!parentId) {
      snapshot.parentId = EMPTY_SNAPSHOT_ID;
    }

    this.#snapshots.set(snapshot.id, snapshot);
    this.headSnapshotId.set(snapshot.id);
    this.headVersion.set(version);

    command.status = 'committed';
    command.finishedAt = Date.now();

    logger.info(`Committed snapshot ${snapshot.id} v${version} (${mutations.files.length} file ops)`);

    this.events.emit({
      type: 'WorkspaceCommitted',
      commandId: proposal.commandId,
      snapshotId: snapshot.id,
      parentSnapshotId: snapshot.parentId,
      version,
      at: snapshot.createdAt,
    });

    return { ok: true, snapshot };
  }

  /** Test / session reset helper. */
  reset(): void {
    this.#snapshots.clear();
    this.#commands.clear();
    this.#working.clear();
    this.#diagnostics.clear();
    this.#diagnosticsRevisionBySnapshot.clear();
    this.headSnapshotId.set(EMPTY_SNAPSHOT_ID);
    this.headVersion.set(0);
    this.activeWorkingCommandId.set(undefined);
    this.#commitChain = Promise.resolve();
    this.events.clear();
  }
}

function rebaseMutations(options: {
  baseId: SnapshotId;
  headId: SnapshotId;
  mutations: MutationSet;
  snapshots: ReadonlyMap<SnapshotId, WorkspaceSnapshot>;
}): CommitResult | { ok: true; mutations: MutationSet } {
  try {
    const baseTree = materializeSnapshot(options.baseId, options.snapshots);
    const headTree = materializeSnapshot(options.headId, options.snapshots);
    const proposedTree = applyMutations(baseTree, options.mutations);

    const headChanged = new Set<string>();

    for (const path of new Set([...Object.keys(baseTree), ...Object.keys(headTree)])) {
      const a = baseTree[path];
      const b = headTree[path];

      if (!a && !b) {
        continue;
      }

      if (!a || !b || a.content !== b.content || a.isBinary !== b.isBinary) {
        headChanged.add(path);
      }
    }

    const proposalChanged = new Set(options.mutations.files.map((f) => normalizeProjectPath(f.path)));

    for (const path of proposalChanged) {
      if (headChanged.has(path)) {
        return { ok: false, error: `Conflict on ${path}: HEAD moved since base ${options.baseId}` };
      }
    }

    // Replay proposal onto HEAD by applying proposed tree deltas vs HEAD for proposal paths only.
    const files = options.mutations.files.map((mutation) => {
      const path = normalizeProjectPath(mutation.path);

      if (mutation.kind === 'delete') {
        return { kind: 'delete' as const, path };
      }

      const file = proposedTree[path];

      return {
        kind: 'upsert' as const,
        path,
        content: file?.content ?? mutation.content,
        isBinary: file?.isBinary ?? mutation.isBinary,
      };
    });

    return { ok: true, mutations: { files } };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/** Process-wide workspace for the Builder client session. */
export const workspaceService = new WorkspaceService();
