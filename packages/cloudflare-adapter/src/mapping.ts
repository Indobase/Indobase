/**
 * Concept map: agent execution runtime (CF OS, internal) → Indobase contracts.
 * Customer-facing copy must use the Indobase column only.
 */

export type CfOsConcept =
  | 'workspace'
  | 'gadget'
  | 'agent'
  | 'session'
  | 'tool'
  | 'mutation'
  | 'preview'
  | 'deploy'
  | 'auth'

export type IndobaseConcept =
  | 'Workspace'
  | 'App'
  | 'Agent'
  | 'WorkspaceSession'
  | 'Command'
  | 'MutationProposal'
  | 'ExecutionPreview'
  | 'ExecutionPublish'
  | 'IdentityAndDataPlane'

export type ConceptMapping = {
  cf: CfOsConcept
  indobase: IndobaseConcept
  /** Platform contract area */
  contract: 'Workspace' | 'Identity' | 'Commands' | 'Capabilities' | 'Execution' | 'Documents'
  /** Safe label for UI / agent hints */
  publicLabel: string
}

/** Canonical CF → Indobase map (Phase 1). */
export const INDOBASE_CF_CONCEPT_MAP: readonly ConceptMapping[] = [
  {
    cf: 'workspace',
    indobase: 'Workspace',
    contract: 'Workspace',
    publicLabel: 'Workspace',
  },
  {
    cf: 'gadget',
    indobase: 'App',
    contract: 'Documents',
    publicLabel: 'App',
  },
  {
    cf: 'agent',
    indobase: 'Agent',
    contract: 'Identity',
    publicLabel: 'Agent',
  },
  {
    cf: 'session',
    indobase: 'WorkspaceSession',
    contract: 'Workspace',
    publicLabel: 'Builder session',
  },
  {
    cf: 'tool',
    indobase: 'Command',
    contract: 'Commands',
    publicLabel: 'Command',
  },
  {
    cf: 'mutation',
    indobase: 'MutationProposal',
    contract: 'Workspace',
    publicLabel: 'Workspace change',
  },
  {
    cf: 'preview',
    indobase: 'ExecutionPreview',
    contract: 'Execution',
    publicLabel: 'Preview',
  },
  {
    cf: 'deploy',
    indobase: 'ExecutionPublish',
    contract: 'Execution',
    publicLabel: 'Launch Business',
  },
  {
    cf: 'auth',
    indobase: 'IdentityAndDataPlane',
    contract: 'Identity',
    publicLabel: 'Indobase project',
  },
] as const

const byCf = new Map(INDOBASE_CF_CONCEPT_MAP.map((row) => [row.cf, row]))

export function mapCfConcept(cf: CfOsConcept): ConceptMapping {
  const row = byCf.get(cf)
  if (!row) {
    throw new Error(`Unknown CF OS concept: ${cf}`)
  }
  return row
}

/** Public label for chrome / hints — never returns upstream vendor product names. */
export function publicLabelForCfConcept(cf: CfOsConcept): string {
  return mapCfConcept(cf).publicLabel
}
