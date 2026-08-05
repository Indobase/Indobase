/**
 * How a project binds to a capability contract.
 * Not "the runtime" — bindings into the contract.
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
 * Project Runtime ABI — read-only.
 * Answers only: what can this application safely assume exists?
 */
export type ProjectRuntime = {
  schemaVersion: 1
  runtimeVersion: number
  projectRef: string
  dataPlane: {
    url: string
    anonKey: string
  }
  capabilities: Partial<Record<CapabilityId, CapabilityDescriptor>>
}

export type RuntimeActor = {
  role?: 'owner' | 'admin' | 'developer' | 'viewer' | string
  plan?: string
}

export type ResolveRuntimeInput = {
  projectRef: string
  dataPlane: ProjectRuntime['dataPlane']
  /** Optional partial overrides from ensurer / Studio (still read-path). */
  capabilities?: Partial<Record<CapabilityId, CapabilityDescriptor>>
  actor?: RuntimeActor
  runtimeVersion?: number
}
