import type { CommandId, ProjectRef, WorkspaceId } from '../ids'

/**
 * Events — everything reacts. Phase 1: in-process typed bus.
 */

export type PlatformEvent<TType extends string = string, TPayload = unknown> = {
  type: TType
  payload: TPayload
  at: string
  projectRef?: ProjectRef | string
  workspaceId?: WorkspaceId | string
  commandId?: CommandId | string
  correlationId?: string
}

export type PlatformEventHandler = (event: PlatformEvent) => void

export type PlatformEventBus = {
  publish(event: PlatformEvent): void
  /** Subscribe to a type, or '*' for all. */
  subscribe(type: string, handler: PlatformEventHandler): () => void
  clear?(): void
}

export function createEventBus(): PlatformEventBus {
  const byType = new Map<string, Set<PlatformEventHandler>>()

  return {
    publish(event) {
      const at = event.at || new Date().toISOString()
      const full = { ...event, at }
      const specific = byType.get(full.type)
      const all = byType.get('*')
      for (const handler of specific ?? []) {
        try {
          handler(full)
        } catch {
          // Listener failures must not break the bus.
        }
      }
      for (const handler of all ?? []) {
        try {
          handler(full)
        } catch {
          // Listener failures must not break the bus.
        }
      }
    },
    subscribe(type, handler) {
      let set = byType.get(type)
      if (!set) {
        set = new Set()
        byType.set(type, set)
      }
      set.add(handler)
      return () => {
        set!.delete(handler)
      }
    },
    clear() {
      byType.clear()
    },
  }
}

/** @deprecated Use createEventBus — alias for older call sites. */
export function createNoopEventBus(): PlatformEventBus {
  return createEventBus()
}

export {
  toPlatformEvent,
  type WorkspaceDomainEvent,
} from './domain'
