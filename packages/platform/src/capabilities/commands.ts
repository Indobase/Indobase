import type { Command } from '../commands'
import { createCommand } from '../commands'
import type { CapabilityId } from '../contracts/runtime'

/**
 * Capability Commands — mutation path (types + constructors).
 * Dispatch goes to Studio / Ensurer. Never mutate via Resolver / ABI read.
 */
export type CapabilityCommandKind =
  | 'capability.enable'
  | 'capability.ensure'
  | 'capability.resolve'
  | 'capability.inspect'

export type EnableCapabilityPayload = {
  capability: CapabilityId
  projectRef: string
}

export type EnsureCapabilityPayload = {
  capability: CapabilityId
  projectRef: string
  /** Opaque ensurer hints — product adapters interpret; ABI does not. */
  hints?: Record<string, unknown>
}

export type ResolveCapabilityPayload = {
  capability?: CapabilityId
  projectRef: string
}

export type InspectCapabilityPayload = {
  capability: CapabilityId
  projectRef: string
}

export type CapabilityCommand = Command<
  CapabilityCommandKind,
  | EnableCapabilityPayload
  | EnsureCapabilityPayload
  | ResolveCapabilityPayload
  | InspectCapabilityPayload
>

export function createCapabilityCommand<K extends CapabilityCommandKind>(
  kind: K,
  payload: CapabilityCommand['payload'],
): CapabilityCommand {
  return createCommand(kind, payload)
}

/**
 * Command constructors only.
 * Ensurer implementations live in Studio / product adapters later.
 */
export const CapabilityCommands = {
  enable: (projectRef: string, capability: CapabilityId) =>
    createCapabilityCommand('capability.enable', { projectRef, capability }),
  ensure: (projectRef: string, capability: CapabilityId, hints?: Record<string, unknown>) =>
    createCapabilityCommand('capability.ensure', { projectRef, capability, hints }),
  resolve: (projectRef: string, capability?: CapabilityId) =>
    createCapabilityCommand('capability.resolve', { projectRef, capability }),
  inspect: (projectRef: string, capability: CapabilityId) =>
    createCapabilityCommand('capability.inspect', { projectRef, capability }),
} as const
