import type { WorkspaceDomainEvent } from '@indobase/platform';

/**
 * Typed domain events — local bus. Event shapes come from `@indobase/platform`.
 * Prefer snapshot/build ids so subscribers never chase a moving tree.
 */
export type { WorkspaceDomainEvent } from '@indobase/platform';

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
