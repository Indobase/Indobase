import type { BuildId, CommandId, DiagnosticsId, SnapshotId } from '../ids'

/**
 * Typed domain facts — prefer snapshot/build ids so subscribers never chase a moving tree.
 * Products may keep a specialized bus; platform owns the union + PlatformEvent wrapper.
 */

export type WorkspaceDomainEvent =
  | {
      type: 'CommandQueued'
      commandId: CommandId
      baseSnapshotId: SnapshotId
      at: number
    }
  | {
      type: 'CommandStarted'
      commandId: CommandId
      at: number
    }
  | {
      type: 'WorkspaceCommitted'
      commandId: CommandId
      snapshotId: SnapshotId
      parentSnapshotId: SnapshotId | null
      version: number
      at: number
    }
  | {
      type: 'CommandFailed'
      commandId: CommandId
      error: string
      at: number
    }
  | {
      type: 'DiagnosticsCompleted'
      diagnosticsId: DiagnosticsId
      snapshotId: SnapshotId
      diagnostics: Array<{
        filePath?: string
        message: string
        line?: number
        column?: number
        source: string
        code?: string
      }>
      at: number
    }
  | {
      type: 'BuildStarted'
      buildId: BuildId
      snapshotId: SnapshotId
      at: number
    }
  | {
      type: 'BuildFinished'
      buildId: BuildId
      snapshotId: SnapshotId
      status: 'succeeded' | 'failed'
      outputRef?: string
      error?: string
      at: number
    }
  | {
      type: 'PreviewReady'
      snapshotId: SnapshotId
      buildId?: BuildId
      previewUrl: string
      at: number
    }
  | {
      type: 'DeploymentPublished'
      snapshotId: SnapshotId
      buildId?: BuildId
      deployRef: string
      at: number
    }
  | {
      type: 'ExecutionFinished'
      executionId: string
      kind: string
      ok: boolean
      outputRef?: string
      error?: string
      at: number
    }

/** Lift a domain event into the generic PlatformEvent envelope shape. */
export function toPlatformEvent(
  event: WorkspaceDomainEvent,
  meta: { projectRef?: string; workspaceId?: string; correlationId?: string } = {},
) {
  return {
    type: event.type,
    payload: event,
    at: new Date(event.at).toISOString(),
    projectRef: meta.projectRef,
    workspaceId: meta.workspaceId,
    commandId: 'commandId' in event ? event.commandId : undefined,
    correlationId: meta.correlationId,
  }
}
