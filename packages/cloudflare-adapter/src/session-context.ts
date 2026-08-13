/**
 * Bridge SSO session → Indobase Generation Context / ProjectRuntime-shaped inputs.
 * Studio remains identity SoT; adapter only reshapes for agent turns.
 */

import {
  buildGenerationCapabilityContext,
  formatGenerationCapabilityContextPrompt,
  type GenerationCapabilityContext,
  type ProjectRuntime,
  assertProjectRuntimeAbi,
} from '@indobase/platform'

import { ACCOUNT_IN_CHAT_RULES, GUEST_ACCOUNT_FIRST_HINT, MEMBER_SESSION_HINT } from './account-routing'
import { stripVendorBranding } from './brand'
import { DESIGN_FORMAT_ROUTING_RULES } from './design-format-routing'
import { LAUNCH_AGENT_HARD_RULES, LAUNCH_SESSION_HINT } from './launch-routing'
import { PROMPT_QUOTA_AGENT_RULES, PROMPT_QUOTA_SESSION_HINT } from './prompt-quota-routing'

/** Minimal session shape shared by the CFOS bridge (camelCase session cookie). */
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

export type AgentSessionContext = {
  schemaVersion: 1
  projectRef: string
  projectName?: string
  operatorEmail: string
  organizationSlug?: string
  /** Tenant data-plane credentials only — not Studio topology. */
  dataPlane?: {
    url: string
    anonKey: string
  }
  /** Same-origin proxy path preferred by agents. */
  indobaseProxyPath: string
  generation: GenerationCapabilityContext
  /** Customer-safe agent hint (vendor branding stripped). */
  agentHint: string
}

const DEFAULT_PROXY = '/api/indobase/proxy/'

/**
 * Map a Studio SSO bridge session into Indobase agent session context.
 * Does not invent capabilities — empty list until Resolver/Ensurer fills them.
 */
export function sessionToAgentContext(
  session: BridgeSessionLike,
  options: {
    capabilities?: ProjectRuntime['capabilities']
    indobaseProxyPath?: string
    runtimeVersion?: number
  } = {},
): AgentSessionContext {
  const dataPlane =
    session.backend?.api_url && session.backend?.anon_key
      ? {
          url: session.backend.api_url,
          anonKey: session.backend.anon_key,
        }
      : undefined

  const runtime: ProjectRuntime = {
    schemaVersion: 1,
    runtimeVersion: options.runtimeVersion ?? 1,
    projectRef: session.projectRef,
    dataPlane: dataPlane ?? { url: '', anonKey: '' },
    capabilities: options.capabilities ?? {},
  }
  assertProjectRuntimeAbi(runtime)

  const generation = buildGenerationCapabilityContext(runtime)
  const proxy = options.indobaseProxyPath ?? DEFAULT_PROXY
  const isGuest =
    !session.email ||
    session.orgSlug === 'guest' ||
    session.projectRef.startsWith('draft_')

  const hintParts = [
    ...(isGuest ? [GUEST_ACCOUNT_FIRST_HINT, ACCOUNT_IN_CHAT_RULES] : [MEMBER_SESSION_HINT]),
    'You are operating inside Indobase OS (Agentic Business OS).',
    `Business workspace: ${session.projectName || session.projectRef} (${session.projectRef}).`,
    isGuest
      ? 'Operator is a Guest (not signed in yet). Account gate above is mandatory — do not start docs/design/code/launch until /auth/verify succeeds. Do not emit niche/recommendation cards during auth. After verify, continue the original request immediately — do not ask them to wait or refresh.'
      : `Operator signed in as ${session.email}. Do NOT re-ask name/email/OTP/Create account. Do not ask them to refresh. Launch / Go Live → launchProductionApp. Read products/orders from BusinessSnapshot.`,
    dataPlane
      ? `Business data for this workspace is available. Prefer same-origin Indobase proxy ${proxy}* with session cookies when calling APIs. Speak business language — never tell the operator a database or backend is attached or missing when BusinessSnapshot lists products/orders.`
      : 'Preview/catalog may still be empty. On Launch / Go Live call launchProductionApp — the job provisions what the business needs. launchBusiness is preview/draft only. Do not tell the operator a backend is missing.',
    LAUNCH_SESSION_HINT,
    LAUNCH_AGENT_HARD_RULES,
    ...(isGuest ? [] : [PROMPT_QUOTA_SESSION_HINT, PROMPT_QUOTA_AGENT_RULES]),
    'NEVER tell the operator to use third-party hosts (page builders, git pages, generic CDNs). NEVER send them to Studio. Only Indobase subdomain or their own domain on Indobase.',
    dataPlane
      ? 'Add payments → Enable via capability.ensure (Lane 2). Enable ≠ Connect.'
      : 'Add login / database / payments → Enable via ensureLogin, ensureDatabase, applySchema, or guidedBackend when the product needs auth or live data — not for pure landing pages.',
    'Customer verbs: Launch Business / Go Live. Never say deploy, publish, or site hosting to the operator.',
    'Discoverable actions (command palette / chat): Create account (guests), Go Live / Launch Business, Add login, Enable payments — finish inside Indobase OS.',
    'Brand all customer-facing UI as Indobase only.',
    'Built-in formats: Docs (format.document), Sheets (format.spreadsheet), Slides (format.slides), Design (format.design).',
    DESIGN_FORMAT_ROUTING_RULES,
    'Propose workspace file changes as MutationProposals; Indobase Workspace commits via Commands — do not treat the agent runtime as durable storage.',
    'Finish every task inside Indobase OS without leaving.',
  ]

  return {
    schemaVersion: 1,
    projectRef: session.projectRef,
    projectName: session.projectName,
    operatorEmail: session.email,
    organizationSlug: session.orgSlug,
    dataPlane,
    indobaseProxyPath: proxy,
    generation,
    agentHint: stripVendorBranding(hintParts.join(' ')),
  }
}

/** Prompt appendix combining session + capability gateway. */
export function formatAgentSessionPrompt(ctx: AgentSessionContext): string {
  const cap = formatGenerationCapabilityContextPrompt(ctx.generation)
  return stripVendorBranding(
    `
<indobase_builder_session>
  projectRef: ${ctx.projectRef}
  projectName: ${ctx.projectName || ctx.projectRef}
  indobaseProxyPath: ${ctx.indobaseProxyPath}
  ${ctx.dataPlane ? `dataPlaneUrl: ${ctx.dataPlane.url}` : 'dataPlane: (none)'}
</indobase_builder_session>
<indobase_go_live>
${LAUNCH_AGENT_HARD_RULES}
</indobase_go_live>
<indobase_format_routing>
${DESIGN_FORMAT_ROUTING_RULES}
</indobase_format_routing>
${cap}`.trim(),
  )
}
