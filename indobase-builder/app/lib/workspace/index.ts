/**
 * Builder workspace implementation (Gen-1).
 * Gen 3 durable mutations must flow Commands / MutationProposal — not ActionRunner as owner.
 * Enable with BUILDER_GEN3_COMMANDS=1 (see gen3-flag / gen3-apply).
 * @see docs/BUILDER-GEN3.md
 */
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
export {
  isBuilderGen3CommandsEnabled,
  setBuilderGen3CommandsEnabledForTests,
} from './gen3-flag';
export {
  applyProposalsViaWorkspace,
  type ApplyProposalsViaWorkspaceInput,
  type ApplyProposalsViaWorkspaceResult,
} from './gen3-apply';
export { commitWorkbenchFilesViaGen3 } from './gen3-commit';
export { GEN3_LOCAL_PROJECT_REF, resolveGen3ProjectRef } from './gen3-project-ref';
export { BuildService, buildService } from './build-service';
export { resetBuilderSession } from './reset-session';
export type { WorkingCommandSession } from './working-command';
