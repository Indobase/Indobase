import type { BuildId, CommandId, DiagnosticsId, SnapshotId } from './ids';
import type { WorkspaceDiagnostic } from './types';

/**
 * Typed domain events — local only. No generic broker.
 * Prefer snapshot/build ids so subscribers never chase a moving tree.
 */
export type WorkspaceDomainEvent =
  | {
      type: 'CommandQueued';
      commandId: CommandId;
      baseSnapshotId: SnapshotId;
      at: number;
    }
  | {
      type: 'CommandStarted';
      commandId: CommandId;
      at: number;
    }
  | {
      type: 'WorkspaceCommitted';
      commandId: CommandId;
      snapshotId: SnapshotId;
      parentSnapshotId: SnapshotId | null;
      version: number;
      at: number;
    }
  | {
      type: 'CommandFailed';
      commandId: CommandId;
      error: string;
      at: number;
    }
  | {
      type: 'DiagnosticsCompleted';
      diagnosticsId: DiagnosticsId;
      snapshotId: SnapshotId;
      diagnostics: WorkspaceDiagnostic[];
      at: number;
    }
  | {
      type: 'BuildStarted';
      buildId: BuildId;
      snapshotId: SnapshotId;
      at: number;
    }
  | {
      type: 'BuildFinished';
      buildId: BuildId;
      snapshotId: SnapshotId;
      status: 'succeeded' | 'failed';
      outputRef?: string;
      error?: string;
      at: number;
    }
  | {
      type: 'PreviewReady';
      snapshotId: SnapshotId;
      buildId?: BuildId;
      previewUrl: string;
      at: number;
    }
  | {
      type: 'DeploymentPublished';
      snapshotId: SnapshotId;
      buildId?: BuildId;
      deployRef: string;
      at: number;
    };

export type WorkspaceEventListener = (event: WorkspaceDomainEvent) => void;

export class WorkspaceEventBus {
  #listeners = new Set<WorkspaceEventListener>();

  subscribe(listener: WorkspaceEventListener): () => void {
    this.#listeners.add(listener);

    return () => {
      this.#listeners.delete(listener);
    };
  }

  emit(event: WorkspaceDomainEvent): void {
    for (const listener of this.#listeners) {
      try {
        listener(event);
      } catch (error) {
        console.error('[workspace-events] listener failed', error);
      }
    }
  }

  clear(): void {
    this.#listeners.clear();
  }
}
