import { createAdapterRegistry, type AdapterRegistryApi } from './adapters/registry'
import { CapabilityCommands } from './capabilities/commands'
import {
  createCapabilityRegistry,
  type CapabilityDefinition,
  type CapabilityRegistryApi,
} from './capabilities/registry'
import { registerGen1Capabilities } from './capabilities/register-gen1'
import {
  buildGenerationCapabilityContext,
  formatGenerationCapabilityContextPrompt,
  type GenerationCapabilityContext,
} from './capabilities/generation-context'
import {
  getResolvedCapability,
  resolveProjectRuntime,
} from './capabilities/resolver'
import type {
  CapabilityDescriptor,
  CapabilityId,
  ProjectRuntime,
  ResolveRuntimeInput,
} from './contracts/runtime'
import { ExecutionCommands } from './execution'
import { createEventBus, type PlatformEventBus } from './events'

export type PlatformApi = {
  readonly capabilities: CapabilityRegistryApi
  readonly adapters: AdapterRegistryApi
  readonly events: PlatformEventBus
  readonly commands: typeof CapabilityCommands
  readonly execution: typeof ExecutionCommands

  /** Registry lookup — definition, not resolved project state. */
  getCapability(id: CapabilityId): CapabilityDefinition | undefined

  /**
   * Capability Resolver gateway — read-only Project Runtime ABI.
   * Prefer this (or `resolveProjectRuntime`) for agents / generation context.
   */
  resolve(input: ResolveRuntimeInput): ProjectRuntime

  /** Alias of `resolve` — explicit Capability Resolver entrypoint. */
  resolveProjectRuntime(input: ResolveRuntimeInput): ProjectRuntime

  getResolvedCapability(
    runtime: ProjectRuntime,
    id: CapabilityId,
  ): CapabilityDescriptor | undefined

  /** Prompt-safe capability snapshot for codegen / agents. */
  buildGenerationCapabilityContext(runtime: ProjectRuntime): GenerationCapabilityContext

  /** XML appendix derived from `buildGenerationCapabilityContext`. */
  formatGenerationCapabilityContextPrompt(runtime: ProjectRuntime): string
}

export type CreatePlatformOptions = {
  /** Skip Gen-1 auto-registration (tests). */
  registerGen1?: boolean
  eventBus?: PlatformEventBus
}

export function createPlatform(options: CreatePlatformOptions = {}): PlatformApi {
  const capabilities = createCapabilityRegistry()
  if (options.registerGen1 !== false) {
    registerGen1Capabilities(capabilities)
  }

  const adapters = createAdapterRegistry()
  const events = options.eventBus ?? createEventBus()

  return {
    capabilities,
    adapters,
    events,
    commands: CapabilityCommands,
    execution: ExecutionCommands,
    getCapability(id) {
      return capabilities.get(id)
    },
    resolve(input) {
      return resolveProjectRuntime(capabilities, input)
    },
    resolveProjectRuntime(input) {
      return resolveProjectRuntime(capabilities, input)
    },
    getResolvedCapability,
    buildGenerationCapabilityContext,
    formatGenerationCapabilityContextPrompt(runtime) {
      return formatGenerationCapabilityContextPrompt(
        buildGenerationCapabilityContext(runtime),
      )
    },
  }
}

/** Default process-wide platform instance (Gen-1 capabilities registered). */
export const Platform = createPlatform()
