import type { CapabilityBindings, CapabilityDescriptor, CapabilityId } from '../contracts/runtime'

export type CapabilityDefinition = {
  id: CapabilityId
  /** Human label for docs/debug — not product marketing names in codegen */
  label: string
  intents: readonly string[]
  /**
   * Permission strings this capability may grant when enabled.
   * Ensurer/Studio narrows these by role/plan.
   */
  defaultPermissions: readonly string[]
  /**
   * Optional default bindings when data plane alone is enough (e.g. auth).
   * Product-specific bindings come from adapters later — not hardcoded hosts here.
   */
  buildDefaultBindings?: (input: {
    dataPlane: { url: string; anonKey: string }
    projectRef: string
  }) => CapabilityBindings
}

export type CapabilityRegistryApi = {
  register(definition: CapabilityDefinition): void
  get(id: CapabilityId): CapabilityDefinition | undefined
  list(): CapabilityDefinition[]
  has(id: CapabilityId): boolean
}

export function createCapabilityRegistry(
  initial: CapabilityDefinition[] = [],
): CapabilityRegistryApi {
  const byId = new Map<CapabilityId, CapabilityDefinition>()

  for (const def of initial) {
    byId.set(def.id, def)
  }

  return {
    register(definition) {
      byId.set(definition.id, definition)
    },
    get(id) {
      return byId.get(id)
    },
    list() {
      return [...byId.values()]
    },
    has(id) {
      return byId.has(id)
    },
  }
}

export function descriptorFromDefinition(
  def: CapabilityDefinition,
  input: {
    enabled: boolean
    dataPlane: { url: string; anonKey: string }
    projectRef: string
    permissions?: readonly string[]
    bindings?: CapabilityBindings
  },
): CapabilityDescriptor {
  const bindings =
    input.bindings ??
    def.buildDefaultBindings?.({
      dataPlane: input.dataPlane,
      projectRef: input.projectRef,
    }) ??
    {}

  return {
    enabled: input.enabled,
    intents: def.intents,
    permissions: input.permissions ?? (input.enabled ? def.defaultPermissions : []),
    bindings,
  }
}
