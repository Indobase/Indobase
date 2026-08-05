import type {
  CapabilityDescriptor,
  CapabilityId,
  ProjectRuntime,
  ResolveRuntimeInput,
} from '../contracts/runtime'
import { descriptorFromDefinition, type CapabilityRegistryApi } from './registry'

/**
 * Capability Resolver — read-only.
 * Describes what exists. Does not create sites, merchants, or schemas (that is Ensurer).
 */
export function resolveProjectRuntime(
  registry: CapabilityRegistryApi,
  input: ResolveRuntimeInput,
): ProjectRuntime {
  const capabilities: ProjectRuntime['capabilities'] = {}

  for (const def of registry.list()) {
    const override = input.capabilities?.[def.id]
    if (override) {
      capabilities[def.id] = override
      continue
    }

    // Gen-1: auth is assumed whenever data plane credentials exist.
    // Other capabilities stay absent until Ensurer / Studio provides descriptors.
    if (def.id === 'auth' && input.dataPlane.url && input.dataPlane.anonKey) {
      capabilities.auth = descriptorFromDefinition(def, {
        enabled: true,
        dataPlane: input.dataPlane,
        projectRef: input.projectRef,
        permissions: filterPermissionsForActor(def.defaultPermissions, input.actor?.role),
      })
    }
  }

  return {
    schemaVersion: 1,
    runtimeVersion: input.runtimeVersion ?? 1,
    projectRef: input.projectRef,
    dataPlane: input.dataPlane,
    capabilities,
  }
}

export function getResolvedCapability(
  runtime: ProjectRuntime,
  id: CapabilityId,
): CapabilityDescriptor | undefined {
  return runtime.capabilities[id]
}

function filterPermissionsForActor(
  permissions: readonly string[],
  role?: string,
): readonly string[] {
  if (!role || role === 'viewer') {
    // Viewers: session read only for auth-style permissions
    return permissions.filter((p) => p.endsWith(':session') || p.endsWith(':read'))
  }
  return permissions
}
