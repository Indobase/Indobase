/**
 * CFOS chat-turn metering — hard enforcement via POST /api/os/agent/begin-turn.
 * Matches classic Builder shouldConsumeBuilderPrompt spirit: consume on every
 * non-empty user send unless marked as internal/orchestrator.
 */

import { explainGovernanceGate } from './governance-gates.js'

export const BRIDGE_AGENT_BEGIN_TURN_PATH = '/api/os/agent/begin-turn'

const ORCHESTRATOR_MARKERS = [
  '[Orchestrator Agent]',
  '[Internal Agent]',
  '[indobase:internal]',
]

export function shouldConsumeAgentTurn({ message }: { message?: string }): boolean {
  const text = typeof message === 'string' ? message.trim() : ''
  if (!text) return false
  for (const marker of ORCHESTRATOR_MARKERS) {
    if (text.includes(marker)) return false
  }
  return true
}

export type BeginTurnInterpretResult = {
  ok: boolean
  exhausted: boolean
  accountRequired: boolean
  quota: unknown
  code: string | null
  message: string | null
  httpStatus: number
}

/** Map begin-turn / prompt-quota HTTP results for ChatInterface + agents. */
export function interpretBeginTurnResult(
  status: number,
  body: {
    ok?: boolean
    code?: string
    message?: string
    quota?: unknown
  } | null | undefined,
): BeginTurnInterpretResult {
  const code = typeof body?.code === 'string' ? body.code : null
  const message = typeof body?.message === 'string' ? body.message.trim() || null : null
  const quota = body?.quota ?? null

  if (status === 402 || code === 'prompt_quota_exceeded') {
    return {
      ok: false,
      exhausted: true,
      accountRequired: false,
      quota,
      code: code || 'prompt_quota_exceeded',
      message: message || explainGovernanceGate({ code: 'prompt_quota_exceeded' }).message,
      httpStatus: 402,
    }
  }

  if (status === 403 || code === 'account_required') {
    return {
      ok: false,
      exhausted: false,
      accountRequired: true,
      quota,
      code: code || 'account_required',
      message: message || explainGovernanceGate({ code: 'account_required' }).message,
      httpStatus: 403,
    }
  }

  if (!body?.ok || status >= 400) {
    return {
      ok: false,
      exhausted: false,
      accountRequired: false,
      quota,
      code,
      message: message || 'Could not begin agent turn.',
      httpStatus: status >= 400 ? status : 502,
    }
  }

  return {
    ok: true,
    exhausted: false,
    accountRequired: false,
    quota,
    code: null,
    message: null,
    httpStatus: status || 200,
  }
}
