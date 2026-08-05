import { createScopedLogger } from '~/utils/logger';
import { createCommandId, type SnapshotId } from './ids';
import type { WorkspaceEventBus } from './events';
import type {
  CommandIntent,
  CommandReason,
  CommandScope,
  MutationSet,
  WorkspaceCommand,
  WorkspaceCommandType,
  WorkspaceSnapshot,
} from './types';
import type { CommitResult, WorkspaceService } from './workspace-service';
import { workspaceService as defaultWorkspace } from './workspace-service';

const logger = createScopedLogger('CommandScheduler');

export type EnqueueCommandInput = {
  type: WorkspaceCommandType;
  intent: CommandIntent;
  scope: CommandScope;
  reason: CommandReason;
  goal?: string;
  /** Defaults to current workspace HEAD. */
  baseSnapshotId?: SnapshotId;
  /**
   * Produces the mutation set for this command.
   * May run while other read-only work proceeds; commits are serialized by WorkspaceService.
   */
  plan: (command: WorkspaceCommand) => Promise<MutationSet> | MutationSet;
};

export type EnqueueCommandResult =
  | { ok: true; command: WorkspaceCommand; snapshot: WorkspaceSnapshot }
  | { ok: false; command: WorkspaceCommand; error: string };

/**
 * Schedules commands against immutable snapshot bases.
 * v1 runs mutating plans serially; contracts never assume a single CommandId exists globally.
 */
export class CommandScheduler {
  #workspace: WorkspaceService;
  #queue: Promise<unknown> = Promise.resolve();
  #pending = new Map<string, WorkspaceCommand>();

  constructor(workspace: WorkspaceService = defaultWorkspace) {
    this.#workspace = workspace;
  }

  get events(): WorkspaceEventBus {
    return this.#workspace.events;
  }

  get pendingCommands(): WorkspaceCommand[] {
    return [...this.#pending.values()];
  }

  enqueue(input: EnqueueCommandInput): Promise<EnqueueCommandResult> {
    const command: WorkspaceCommand = {
      id: createCommandId(),
      type: input.type,
      intent: input.intent,
      scope: input.scope,
      reason: input.reason,
      baseSnapshotId: input.baseSnapshotId ?? this.#workspace.headSnapshotId.get(),
      status: 'queued',
      createdAt: Date.now(),
      goal: input.goal,
    };

    this.#workspace.registerCommand(command);
    this.#pending.set(command.id, command);

    const run = this.#queue.then(() => this.#run(command, input.plan));
    this.#queue = run.then(
      () => undefined,
      () => undefined,
    );

    return run;
  }

  async #run(
    command: WorkspaceCommand,
    plan: EnqueueCommandInput['plan'],
  ): Promise<EnqueueCommandResult> {
    this.#workspace.markCommandStarted(command.id);

    try {
      const mutations = await plan(command);
      const result: CommitResult = await this.#workspace.commit({
        commandId: command.id,
        baseSnapshotId: command.baseSnapshotId,
        mutations,
      });

      this.#pending.delete(command.id);

      if (!result.ok) {
        logger.warn(`Command ${command.id} failed to commit: ${result.error}`);

        return { ok: false, command, error: result.error };
      }

      return { ok: true, command, snapshot: result.snapshot };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.#workspace.markCommandFailed(command.id, message);
      this.#pending.delete(command.id);
      logger.error(`Command ${command.id} failed`, error);

      return { ok: false, command, error: message };
    }
  }
}

export const commandScheduler = new CommandScheduler();
