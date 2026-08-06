/**
 * Agent turn interface — Indobase orchestrates; CF OS executes ephemerally.
 */

import {
  createCommandId,
  createEventBus,
  toPlatformEvent,
  type Command,
  type MutationProposal,
  type PlatformEvent,
  type PlatformEventBus,
  type SnapshotId,
  EMPTY_SNAPSHOT_ID,
} from '@indobase/platform'

import type { GenerationCapabilityContext } from '@indobase/platform'
import { applyProposalsViaCommands, type ApplyProposalsMeta, type AppliedProposalCommand } from './mutation-proposals'
import { stripVendorBranding } from './brand'

export type AgentTurnRequest = {
  projectRef: string
  workspaceId?: string
  goal: string
  baseSnapshotId?: SnapshotId | string
  generationContext?: GenerationCapabilityContext
  /** Optional proposals already produced by the execution runtime. */
  proposals?: MutationProposal[]
  actorId?: string
  intent?: ApplyProposalsMeta['intent']
  reason?: ApplyProposalsMeta['reason']
}

export type AgentTurnStatus = 'completed' | 'failed' | 'needs_capability' | 'awaiting_execution'

export type AgentTurnResult = {
  turnId: string
  status: AgentTurnStatus
  goal: string
  projectRef: string
  baseSnapshotId: SnapshotId | string
  proposals: MutationProposal[]
  applied: AppliedProposalCommand[]
  commands: Command[]
  events: PlatformEvent[]
  error?: string
  /** Customer-safe summary (vendor branding stripped). */
  summary: string
}

export type StartAgentTurnOptions = {
  /** Inject event bus (tests / bridge). Defaults to a fresh in-process bus. */
  bus?: PlatformEventBus
  /**
   * Phase 1: when no proposals are supplied, mark the turn as awaiting_execution
   * rather than inventing file mutations.
   */
  allowEmptyProposals?: boolean
}

/**
 * Start an Indobase-scoped agent turn.
 *
 * Phase 1 behavior:
 * - Validates projectRef / goal
 * - Maps any supplied MutationProposals → Commands (never direct writes)
 * - Emits CommandQueued domain events
 * - Does not call CF OS over the network (bridge / Phase 2 wires transport)
 */
export function startAgentTurn(
  req: AgentTurnRequest,
  options: StartAgentTurnOptions = {},
): AgentTurnResult {
  const turnId = createCommandId()
  const bus = options.bus ?? createEventBus()
  const events: PlatformEvent[] = []
  const baseSnapshotId = req.baseSnapshotId ?? EMPTY_SNAPSHOT_ID

  const publish = (event: Parameters<typeof toPlatformEvent>[0]) => {
    const pe = toPlatformEvent(event, {
      projectRef: req.projectRef,
      workspaceId: req.workspaceId,
      correlationId: turnId,
    })
    bus.publish(pe)
    events.push(pe)
  }

  if (!req.projectRef?.trim()) {
    return {
      turnId,
      status: 'failed',
      goal: req.goal,
      projectRef: req.projectRef,
      baseSnapshotId,
      proposals: [],
      applied: [],
      commands: [],
      events,
      error: 'projectRef is required',
      summary: stripVendorBranding('Agent turn failed: missing project.'),
    }
  }

  if (!req.goal?.trim()) {
    return {
      turnId,
      status: 'failed',
      goal: req.goal,
      projectRef: req.projectRef,
      baseSnapshotId,
      proposals: [],
      applied: [],
      commands: [],
      events,
      error: 'goal is required',
      summary: stripVendorBranding('Agent turn failed: missing goal.'),
    }
  }

  const proposals = req.proposals ?? []
  const allowEmpty = options.allowEmptyProposals ?? true

  if (proposals.length === 0) {
    return {
      turnId,
      status: allowEmpty ? 'awaiting_execution' : 'failed',
      goal: req.goal,
      projectRef: req.projectRef,
      baseSnapshotId,
      proposals: [],
      applied: [],
      commands: [],
      events,
      error: allowEmpty ? undefined : 'No MutationProposals supplied',
      summary: stripVendorBranding(
        allowEmpty
          ? `Agent turn ${turnId} queued for project ${req.projectRef}; awaiting execution runtime proposals.`
          : `Agent turn ${turnId} failed: no proposals.`,
      ),
    }
  }

  try {
    const applied = applyProposalsViaCommands(proposals, {
      projectRef: req.projectRef,
      workspaceId: req.workspaceId,
      intent: req.intent,
      reason: req.reason ?? 'user',
      goal: req.goal,
      actorId: req.actorId,
    })

    for (const row of applied) {
      publish({
        type: 'CommandQueued',
        commandId: row.workspaceCommand.id,
        baseSnapshotId: row.workspaceCommand.baseSnapshotId,
        at: Date.now(),
      })
    }

    return {
      turnId,
      status: 'completed',
      goal: req.goal,
      projectRef: req.projectRef,
      baseSnapshotId,
      proposals: applied.map((a) => a.proposal),
      applied,
      commands: applied.map((a) => a.platformCommand),
      events,
      summary: stripVendorBranding(
        `Agent turn ${turnId}: ${applied.length} proposal(s) mapped to Indobase Commands for ${req.projectRef}.`,
      ),
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return {
      turnId,
      status: 'failed',
      goal: req.goal,
      projectRef: req.projectRef,
      baseSnapshotId,
      proposals,
      applied: [],
      commands: [],
      events,
      error: message,
      summary: stripVendorBranding(`Agent turn failed: ${message}`),
    }
  }
}
