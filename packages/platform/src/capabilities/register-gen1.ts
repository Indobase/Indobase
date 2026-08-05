import { authCapability } from './definitions/auth'
import {
  businessDataCapability,
  catalogCapability,
  commerceCapability,
  eventsCapability,
  functionsCapability,
} from './definitions/stubs'
import { createCapabilityRegistry, type CapabilityRegistryApi } from './registry'

/** Register Gen-1 OS capabilities. Additive registrations happen via CapabilityRegistry.register. */
export function registerGen1Capabilities(
  registry: CapabilityRegistryApi = createCapabilityRegistry(),
): CapabilityRegistryApi {
  registry.register(authCapability)
  registry.register(commerceCapability)
  registry.register(eventsCapability)
  registry.register(businessDataCapability)
  registry.register(catalogCapability)
  registry.register(functionsCapability)
  return registry
}

export {
  authCapability,
  businessDataCapability,
  catalogCapability,
  commerceCapability,
  eventsCapability,
  functionsCapability,
}
