/**
 * CapabilityAdapter — Indobase capability → hidden implementation (ADR 0008).
 *
 * Auth / Business Data / File Storage go through this. Provider names never
 * appear in customer copy. PocketBase is today's impl; the type stays replaceable.
 */

import type { CapabilityId } from '../contracts/runtime'
import type { CapabilityProviderAdapter } from './orchestrator'

export type CapabilityAdapter = CapabilityProviderAdapter

export type CapabilityAdapterEnsureInput = {
  businessRef: string
  capabilityId: CapabilityId
}

/** Capabilities that must never name a provider in operator chrome. */
export const HIDDEN_ENGINE_CAPABILITIES = ['auth', 'businessData', 'storage'] as const

export function isHiddenEngineCapability(id: string): boolean {
  return (HIDDEN_ENGINE_CAPABILITIES as readonly string[]).includes(id)
}
