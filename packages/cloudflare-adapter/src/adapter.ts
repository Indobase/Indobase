/**
 * CloudflareOsAdapter — Indobase-facing interface for the agent execution runtime.
 * Implementations must never write durable project state; only propose + execute ephemerally.
 */

import type { Command, MutationProposal, PlatformEventBus } from '@indobase/platform'
import {
  startAgentTurn,
  type AgentTurnRequest,
  type AgentTurnResult,
  type StartAgentTurnOptions,
} from './agent-turn'
import {
  applyProposalsViaCommands,
  type ApplyProposalsMeta,
  type AppliedProposalCommand,
} from './mutation-proposals'
import { assertNoVendorBranding, stripVendorBranding } from './brand'
import {
  formatAgentSessionPrompt,
  sessionToAgentContext,
  type AgentSessionContext,
  type BridgeSessionLike,
} from './session-context'
import { mapCfConcept, publicLabelForCfConcept, type CfOsConcept } from './mapping'

export type CloudflareOsAdapter = {
  /** Map an internal CF concept to Indobase public labeling / contract. */
  mapConcept(cf: CfOsConcept): ReturnType<typeof mapCfConcept>
  publicLabel(cf: CfOsConcept): string

  startAgentTurn(req: AgentTurnRequest, options?: StartAgentTurnOptions): AgentTurnResult

  applyProposalsViaCommands(
    proposals: readonly MutationProposal[],
    meta: ApplyProposalsMeta,
  ): AppliedProposalCommand[]

  stripVendorBranding(text: string): string
  assertNoVendorBranding(text: string, label?: string): void

  sessionToAgentContext(session: BridgeSessionLike): AgentSessionContext
  formatAgentSessionPrompt(ctx: AgentSessionContext): string
}

export type CreateCloudflareOsAdapterOptions = {
  bus?: PlatformEventBus
  indobaseProxyPath?: string
}

/** Default in-process adapter (Phase 1). Transport to CF OS is bridge-owned. */
export function createCloudflareOsAdapter(
  options: CreateCloudflareOsAdapterOptions = {},
): CloudflareOsAdapter {
  return {
    mapConcept: mapCfConcept,
    publicLabel: publicLabelForCfConcept,

    startAgentTurn(req, turnOptions) {
      return startAgentTurn(req, { bus: options.bus, ...turnOptions })
    },

    applyProposalsViaCommands,

    stripVendorBranding,
    assertNoVendorBranding,

    sessionToAgentContext(session) {
      return sessionToAgentContext(session, {
        indobaseProxyPath: options.indobaseProxyPath,
      })
    },

    formatAgentSessionPrompt,
  }
}

/** Collect platform Command envelopes from applied proposals. */
export function commandsFromApplied(applied: AppliedProposalCommand[]): Command[] {
  return applied.map((a) => a.platformCommand)
}
