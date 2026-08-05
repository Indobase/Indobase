import type { PlatformActor } from '../identity'
import type { CommandId, ProjectRef, SnapshotId, WorkspaceId } from '../ids'
import { createCommandId } from '../ids'

/**
 * Commands — every mutation is a command. Never mutate directly.
 */

export type Command<TKind extends string = string, TPayload = unknown> = {
  id: CommandId
  kind: TKind
  payload: TPayload
  issuedAt: string
  actor?: PlatformActor
  projectRef?: ProjectRef | string
  workspaceId?: WorkspaceId | string
  baseSnapshotId?: SnapshotId | string
  correlationId?: string
}

/** @deprecated Prefer Command — kept for Gen-1 capability constructors. */
export type PlatformCommand<TKind extends string = string, TPayload = unknown> = Command<
  TKind,
  TPayload
>

export type PlatformIntent = {
  id: string
  kind: string
  payload?: Record<string, unknown>
}

export function createCommand<K extends string, P>(
  kind: K,
  payload: P,
  meta: Omit<Command<K, P>, 'id' | 'kind' | 'payload' | 'issuedAt'> = {},
): Command<K, P> {
  return {
    id: createCommandId(),
    kind,
    payload,
    issuedAt: new Date().toISOString(),
    ...meta,
  }
}
