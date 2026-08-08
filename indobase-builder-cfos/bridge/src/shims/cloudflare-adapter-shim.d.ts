/**
 * Compile-time shim — runtime resolves the real package from node_modules
 * (`file:../../packages/cloudflare-adapter`). Keeps bridge `tsc` rootDir clean.
 */
export type BridgeSessionLike = {
  email: string
  projectRef: string
  projectName?: string
  orgSlug?: string
  studioUrl?: string
  backend?: {
    api_url: string
    anon_key: string
    project_ref?: string
    auth_url?: string
    rest_url?: string
    storage_url?: string
  } | null
}

export type GenerationCapabilityContext = {
  schemaVersion: 1
  projectRef: string
  capabilities: unknown[]
}

export type AgentSessionContext = {
  schemaVersion: 1
  projectRef: string
  projectName?: string
  operatorEmail: string
  organizationSlug?: string
  dataPlane?: { url: string; anonKey: string }
  indobaseProxyPath: string
  generation: GenerationCapabilityContext
  agentHint: string
}

export type CloudflareOsAdapter = {
  sessionToAgentContext(session: BridgeSessionLike): AgentSessionContext
  stripVendorBranding(text: string): string
  formatAgentSessionPrompt(ctx: AgentSessionContext): string
  publicLabel(cf: string): string
  startAgentTurn(req: unknown, options?: unknown): unknown
  applyProposalsViaCommands(proposals: unknown[], meta: unknown): unknown
  assertNoVendorBranding(text: string, label?: string): void
  mapConcept(cf: string): unknown
}

export function createCloudflareOsAdapter(options?: {
  indobaseProxyPath?: string
}): CloudflareOsAdapter

export function sessionToAgentContext(
  session: BridgeSessionLike,
  options?: { indobaseProxyPath?: string },
): AgentSessionContext

export function stripVendorBranding(text: string): string

export const LAUNCH_AGENT_HARD_RULES: string
export const LAUNCH_SESSION_HINT: string
export const LAUNCH_BUSINESS_TOOL: {
  name: 'launchBusiness'
  aliases: readonly string[]
  description: string
  method: 'POST'
  path: string
  aliasPath: string
  wraps: string
  parameters: unknown
}

export function assertCanClaimLive(result: {
  ok?: boolean
  url?: string | null
}): { allowed: boolean; reason?: string }

export function assertLaunchHasContent(input: {
  html?: unknown
  files?: unknown
}): { ok: boolean; message?: string }

export function promptLooksLikeGoLiveIntent(prompt: string): boolean

export const ACCOUNT_IN_CHAT_RULES: string
export const GUEST_ACCOUNT_FIRST_HINT: string
export const ACCOUNT_AUTH_START: string
export const ACCOUNT_AUTH_VERIFY: string
