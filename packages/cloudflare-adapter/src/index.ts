/**
 * @indobase/cloudflare-adapter — Builder Gen 3
 *
 * Maps agent execution runtime (CF OS, internal) onto @indobase/platform.
 * Indobase owns workspace / commands / events / deploy; CF OS never writes SoT.
 *
 * @see docs/BUILDER-GEN3.md
 */

export {
  INDOBASE_CF_CONCEPT_MAP,
  mapCfConcept,
  publicLabelForCfConcept,
  type CfOsConcept,
  type ConceptMapping,
  type IndobaseConcept,
} from './mapping'

export {
  VENDOR_BRAND_PATTERNS,
  stripVendorBranding,
  hasVendorBranding,
  assertNoVendorBranding,
} from './brand'

export {
  applyProposalsViaCommands,
  proposalsToWorkspaceCommands,
  createMutationProposal,
  type ApplyProposalsMeta,
  type AppliedProposalCommand,
  type MutationProposal,
} from './mutation-proposals'

export {
  startAgentTurn,
  type AgentTurnRequest,
  type AgentTurnResult,
  type AgentTurnStatus,
  type StartAgentTurnOptions,
} from './agent-turn'

export {
  sessionToAgentContext,
  formatAgentSessionPrompt,
  type BridgeSessionLike,
  type AgentSessionContext,
} from './session-context'

export {
  DESIGN_FORMAT_BLUEPRINT_ID,
  DESIGN_FORMAT_INTENT_KEYWORDS,
  DESIGN_FORMAT_ROUTING_RULES,
  DESIGN_FORMAT_INSTANCE_INSTRUCTIONS,
  STANDARD_FORMAT_AGENT_HINTS,
  promptLooksLikeDesignIntent,
  inferDesignPresetFromPrompt,
  preferredFormatForPrompt,
} from './design-format-routing'

export {
  ACCOUNT_IN_CHAT_RULES,
  GUEST_ACCOUNT_FIRST_HINT,
  ACCOUNT_AUTH_START,
  ACCOUNT_AUTH_VERIFY,
} from './account-routing'

export {
  PROMPT_QUOTA_CHECK_PATH,
  PROMPT_QUOTA_CONSUME_PATH,
  PROMPT_QUOTA_EXHAUSTED_OPERATOR_COPY,
  PROMPT_QUOTA_AGENT_RULES,
  PROMPT_QUOTA_SESSION_HINT,
} from './prompt-quota-routing'

export {
  GO_LIVE_INTENT_KEYWORDS,
  FORBIDDEN_HOST_PATTERNS,
  LAUNCH_BUSINESS_TOOL,
  LAUNCH_AGENT_HARD_RULES,
  LAUNCH_SESSION_HINT,
  promptLooksLikeGoLiveIntent,
  urlLooksLikeForbiddenHost,
  assertCanClaimLive,
  assertLaunchHasContent,
  type LiveClaimCheck,
  type LaunchContentCheck,
} from './launch-routing'

export {
  createCloudflareOsAdapter,
  commandsFromApplied,
  type CloudflareOsAdapter,
  type CreateCloudflareOsAdapterOptions,
} from './adapter'

/** Re-exports frequently used platform types so bridge code has one import path. */
export type {
  Command,
  GenerationCapabilityContext,
  ProjectRuntime,
  WorkspaceCommand,
} from '@indobase/platform'
