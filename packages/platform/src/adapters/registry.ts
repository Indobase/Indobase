import type { CapabilityId } from '../contracts/runtime'
import type { CapabilityBindings } from '../contracts/runtime'

/** Adapter kinds — products plug in here; apps never import products. */
export type AdapterKind =
  | 'renderer'
  | 'storage'
  | 'commerce'
  | 'events'
  | 'ai'
  | 'deployment'
  | 'auth'
  | 'businessData'
  | 'functions'
  | (string & {})

/**
 * Adapter interface only — no implementations in Phase 1.
 * Products register adapters; Capability Resolver may consult them later for bindings.
 */
export type PlatformAdapter = {
  kind: AdapterKind
  /** Capability this adapter serves, when applicable */
  capability?: CapabilityId
  /**
   * Optional read of bindings for a project.
   * Must not perform ensurance side effects.
   */
  resolveBindings?(input: {
    projectRef: string
    dataPlane: { url: string; anonKey: string }
  }): CapabilityBindings | Promise<CapabilityBindings>
}

export type AdapterRegistryApi = {
  register(adapter: PlatformAdapter): void
  get(kind: AdapterKind): PlatformAdapter | undefined
  list(): PlatformAdapter[]
  listForCapability(capability: CapabilityId): PlatformAdapter[]
}

export function createAdapterRegistry(initial: PlatformAdapter[] = []): AdapterRegistryApi {
  const byKind = new Map<AdapterKind, PlatformAdapter>()

  for (const adapter of initial) {
    byKind.set(adapter.kind, adapter)
  }

  return {
    register(adapter) {
      byKind.set(adapter.kind, adapter)
    },
    get(kind) {
      return byKind.get(kind)
    },
    list() {
      return [...byKind.values()]
    },
    listForCapability(capability) {
      return [...byKind.values()].filter((a) => a.capability === capability)
    },
  }
}
