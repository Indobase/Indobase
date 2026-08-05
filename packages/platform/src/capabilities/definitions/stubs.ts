import type { CapabilityDefinition } from '../registry'

/** Commerce — checkout/portal/subscribe. Payments is an adapter, not this contract. */
export const commerceCapability: CapabilityDefinition = {
  id: 'commerce',
  label: 'Commerce',
  intents: ['checkout', 'portal', 'subscribe', 'plans'] as const,
  defaultPermissions: ['checkout:create', 'portal:create', 'plans:read'] as const,
}

/** Events — track/pageview. Analytics product is an adapter. */
export const eventsCapability: CapabilityDefinition = {
  id: 'events',
  label: 'Events',
  intents: ['pageview', 'track', 'identify'] as const,
  defaultPermissions: ['events:track', 'events:pageview'] as const,
}

/** Business data — RLS-scoped domain tables (CRM schema is one catalog, not the capability name). */
export const businessDataCapability: CapabilityDefinition = {
  id: 'businessData',
  label: 'Business Data',
  intents: ['read', 'write'] as const,
  defaultPermissions: ['businessData:read', 'businessData:write'] as const,
}

/** Catalog — project metadata (schemas, buckets, functions, providers). Not domain rows. */
export const catalogCapability: CapabilityDefinition = {
  id: 'catalog',
  label: 'Catalog',
  intents: ['inspect'] as const,
  defaultPermissions: ['catalog:read'] as const,
}

/** Edge / serverless functions. */
export const functionsCapability: CapabilityDefinition = {
  id: 'functions',
  label: 'Functions',
  intents: ['invoke'] as const,
  defaultPermissions: ['functions:invoke'] as const,
}
