/**
 * Project Runtime ABI — capabilities-only surface.
 *
 * Answers ONLY: "What can this project safely assume exists?"
 *
 * NOT part of this ABI (quarantine behind product adapters / deploy helpers):
 * - billing status / plan marketing names as output fields
 * - Studio URLs, product hosts (payments.*, analytics.*, …)
 * - internal control-plane APIs
 * - deployment topology (Swarm, Hostinger, compose layout)
 *
 * `dataPlane` is the tenant API credential pair used to materialize capability
 * bindings (e.g. auth). It is not a product hostname registry.
 */

/**
 * How a project binds to a capability contract.
 * Not "the runtime" — bindings into the contract.
 *
 * Adapters may supply env/sdk/endpoints. Do not put Studio or product marketing
 * hosts here as source of truth — those belong outside the ABI.
 */
export type CapabilityBindings = {
  env?: Record<string, string>
  sdk?: {
    package: string
    importHint: string
  }
  endpoints?: Record<string, string>
  snippet?: string
  notes?: string[]
}

export type CapabilityDescriptor = {
  enabled: boolean
  /** Stable contract verbs */
  intents: readonly string[]
  /** What this actor/plan may generate or invoke */
  permissions: readonly string[]
  bindings: CapabilityBindings
}

/** Gen-1 capability ids — registry may grow additively. */
export type Gen1CapabilityId =
  | 'auth'
  | 'commerce'
  | 'events'
  | 'businessData'
  | 'catalog'
  | 'functions'

export type CapabilityId = Gen1CapabilityId | (string & {})

/**
 * Project Runtime ABI — read-only, capability-shaped.
 * Top-level keys are fixed; do not extend with billing/studio/topology fields.
 */
export type ProjectRuntime = {
  schemaVersion: 1
  runtimeVersion: number
  projectRef: string
  /**
   * Tenant data-plane credentials for binding materialization.
   * Not Studio URL, not product topology.
   */
  dataPlane: {
    url: string
    anonKey: string
  }
  capabilities: Partial<Record<CapabilityId, CapabilityDescriptor>>
}

/**
 * Resolver input only — never copied onto ProjectRuntime.
 * `plan` / `role` narrow permissions; they are not ABI output.
 */
export type RuntimeActor = {
  role?: 'owner' | 'admin' | 'developer' | 'viewer' | string
  /**
   * Studio/Ensurer plan hint for permission narrowing.
   * Quarantined: must not appear on ProjectRuntime.
   */
  plan?: string
}

export type ResolveRuntimeInput = {
  projectRef: string
  dataPlane: ProjectRuntime['dataPlane']
  /** Optional partial overrides from ensurer / Studio (still read-path). */
  capabilities?: Partial<Record<CapabilityId, CapabilityDescriptor>>
  /** Permission-narrowing only — never serialized onto the ABI object. */
  actor?: RuntimeActor
  runtimeVersion?: number
}

/** Keys that must never appear as first-class ProjectRuntime fields. */
export const FORBIDDEN_RUNTIME_ABI_KEYS = [
  'billing',
  'billingStatus',
  'plan',
  'studioUrl',
  'studio',
  'topology',
  'deployment',
  'hostname',
  'hostnames',
  'internalApi',
  'internalApis',
  'paymentsUrl',
  'analyticsUrl',
  'crmUrl',
] as const

export type ForbiddenRuntimeAbiKey = (typeof FORBIDDEN_RUNTIME_ABI_KEYS)[number]

/** Runtime check for accidental ABI leakage (tests + adapters). */
export function assertProjectRuntimeAbi(runtime: ProjectRuntime): void {
  const keys = Object.keys(runtime)
  for (const forbidden of FORBIDDEN_RUNTIME_ABI_KEYS) {
    if (keys.includes(forbidden)) {
      throw new Error(`ProjectRuntime ABI forbids first-class field "${forbidden}"`)
    }
  }
}
