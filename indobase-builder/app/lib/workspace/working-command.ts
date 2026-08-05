import type { CommandId, SnapshotId } from './ids';
import type { CommandIntent, CommandReason, CommandScope, WorkspaceCommandType } from './types';
import type { MaterializedTree } from './snapshot-tree';

/** In-flight command with a mutable working tree (proposals not yet committed). */
export type WorkingCommandSession = {
  commandId: CommandId;
  baseSnapshotId: SnapshotId;
  type: WorkspaceCommandType;
  intent: CommandIntent;
  scope: CommandScope;
  reason: CommandReason;
  goal?: string;
  /** Tree after applying all proposals on top of base. */
  workingTree: MaterializedTree;
  proposalCount: number;
  startedAt: number;
};
