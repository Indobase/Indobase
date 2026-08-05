/**
 * Workspace ids — re-exported from the platform kernel.
 * Implementations (WorkspaceService, etc.) stay in Builder; brands live in @indobase/platform.
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
} from '@indobase/platform'
