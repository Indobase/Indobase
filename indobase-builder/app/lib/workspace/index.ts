export {
  createBuildId,
  createCommandId,
  createDiagnosticsId,
  createSnapshotId,
  EMPTY_SNAPSHOT_ID,
  type BuildId,
  type CommandId,
  type DiagnosticsId,
  type SnapshotId,
} from './ids';

export type { WorkspaceDomainEvent, WorkspaceEventListener } from './events';
export { WorkspaceEventBus } from './events';

export {
  applyMutations,
  diffTrees,
  fileMapToTree,
  materializeSnapshot,
  normalizeProjectPath,
  treeToFileMap,
  validateMutationSet,
  type MaterializedFile,
  type MaterializedTree,
} from './snapshot-tree';

export type {
  BuildStatus,
  CommandIntent,
  CommandReason,
  CommandScope,
  CommandStatus,
  DiagnosticsArtifact,
  FileMutation,
  MutationProposal,
  MutationSet,
  WorkspaceBuild,
  WorkspaceCommand,
  WorkspaceCommandType,
  WorkspaceDiagnostic,
  WorkspaceSnapshot,
} from './types';

export { WorkspaceService, workspaceService, type CommitResult, type BeginWorkingCommandInput } from './workspace-service';
export {
  CommandScheduler,
  commandScheduler,
  type EnqueueCommandInput,
  type EnqueueCommandResult,
} from './command-scheduler';
export {
  beginCodegenCommand,
  commitWorkbenchFiles,
  inferCodegenCommandMeta,
  inferRepairCommandMeta,
  proposeWorkbenchFileWrite,
} from './bridge-workbench';
export { BuildService, buildService } from './build-service';
export { resetBuilderSession } from './reset-session';
export type { WorkingCommandSession } from './working-command';