/** Stable verbs an application may rely on for a capability. */
export type CapabilityContract = {
  /** Capability id this contract belongs to */
  capability: string
  /** Stable intent/verb names, e.g. signIn, checkout, track */
  intents: readonly string[]
}
