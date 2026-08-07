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

import { stripVendorBranding } from './brand'
import { DESIGN_FORMAT_ROUTING_RULES } from './design-format-routing'

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

  const hintParts = [
    'You are operating inside Indobase OS (Agentic Business OS).',
    `Business workspace: ${session.projectName || session.projectRef} (${session.projectRef}).`,
    dataPlane
      ? `Backend is attached (Capability lane). Prefer same-origin Indobase proxy ${proxy}* with session cookies when calling APIs.`
      : 'No backend yet — Static Launch only. Docs/Sheets/Slides/Design work without a database.',
    'Go Live / Launch Business: POST /api/os/launch with { subdomain?, customDomain?, html? }. Indobase subdomain (*.indobase.in) or a domain they already own (DNS CNAME to Indobase).',
    'NEVER tell the operator to use third-party hosts (page builders, git pages, generic CDNs). NEVER send them to Studio. Only Indobase subdomain or their own domain on Indobase.',
    'Add login / database / payments → capability.ensure later (Lane 2). Do not provision backend for a normal site launch.',
    'Customer verbs: Launch Business / Go Live. Never say deploy, publish, or site hosting to the operator.',
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
<indobase_format_routing>
${DESIGN_FORMAT_ROUTING_RULES}
</indobase_format_routing>
${cap}`.trim(),
  )
}
