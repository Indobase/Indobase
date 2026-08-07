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
    'You are building inside Indobase Builder.',
    `Project: ${session.projectName || session.projectRef} (${session.projectRef}).`,
    dataPlane
      ? `Prefer same-origin Indobase proxy ${proxy}* with session cookies, or INDOBASE_URL + anon key from the Indobase panel.`
      : 'No Indobase backend payload was provided in the handoff.',
    'Brand all customer-facing UI as Indobase only.',
    'Built-in formats: Docs, Sheets, Slides, and Design. For logos, Instagram posts/stories, posters, or other graphics, create a Design (format.design) instance — do not send users to an external design product.',
    'Propose workspace file changes as MutationProposals; Indobase Workspace commits via Commands — do not treat the agent runtime as durable storage.',
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
${cap}`.trim(),
  )
}
