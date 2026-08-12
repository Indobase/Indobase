/**
 * Bridge-side OS agent prompt quota helpers.
 * Endpoints: GET/POST /api/os/usage/prompt-quota (Platform API → Builder free meter).
 * Runtime hook: ChatInterface POST /api/os/agent/begin-turn (see agent-turn-meter.ts).
 *
 * Agents should still GET/POST prompt-quota on heavy tool paths as defense in depth;
 * the UI begin-turn hook meters ordinary chat sends.
 */
import type { OsPromptQuota, OsPromptQuotaResponse } from '@indobase/platform-api'
import { explainGovernanceGate } from './governance-gates.js'

export const BRIDGE_PROMPT_QUOTA_PATH = '/api/os/usage/prompt-quota'

export const PROMPT_QUOTA_EXHAUSTED_MESSAGE = explainGovernanceGate({
  code: 'prompt_quota_exceeded',
}).message

export type SessionPromptQuotaBlock = {
  path: typeof BRIDGE_PROMPT_QUOTA_PATH
  check: 'GET'
  consume: 'POST'
  note: string
  /** Live snapshot when signed-in and Platform API returned quota; null for guests / errors. */
  quota: OsPromptQuota | null
  exhausted: boolean
  upgrade_copy: string
}

export function isPromptQuotaExhausted(
  quota: Pick<OsPromptQuota, 'isFree' | 'remaining' | 'limit'> | null | undefined,
): boolean {
  if (!quota) return false
  if (!quota.isFree) return false
  if (quota.limit == null) return false
  return quota.remaining != null && quota.remaining <= 0
}

export function upgradeCopyForQuota(
  quota: Pick<OsPromptQuota, 'upgradeUrl'> | null | undefined,
): string {
  return explainGovernanceGate({
    code: 'prompt_quota_exceeded',
    upgradeUrl: typeof quota?.upgradeUrl === 'string' ? quota.upgradeUrl : null,
  }).message
}

/** Shape agents / UI read from /api/session.usage */
export function buildSessionPromptQuotaBlock(
  quota: OsPromptQuota | null | undefined,
): SessionPromptQuotaBlock {
  const q = quota ?? null
  const exhausted = isPromptQuotaExhausted(q)
  return {
    path: BRIDGE_PROMPT_QUOTA_PATH,
    check: 'GET',
    consume: 'POST',
    note: 'ChatInterface meters each user send via POST /api/os/agent/begin-turn. Agents should still GET check / POST consume on heavy tool paths. On 402 stop and show upgrade copy.',
    quota: q,
    exhausted,
    upgrade_copy: upgradeCopyForQuota(q),
  }
}

/** Normalize Platform/bridge JSON for agent tool handlers. */
export function interpretPromptQuotaResponse(
  status: number,
  body: OsPromptQuotaResponse | null | undefined,
): {
  ok: boolean
  exhausted: boolean
  quota: OsPromptQuota | null
  operatorMessage: string | null
  code: string | null
} {
  const quota = body?.quota ?? null
  const code = typeof body?.code === 'string' ? body.code : null
  const exhausted =
    status === 402 ||
    code === 'prompt_quota_exceeded' ||
    isPromptQuotaExhausted(quota)

  if (exhausted) {
    return {
      ok: false,
      exhausted: true,
      quota,
      operatorMessage:
        (typeof body?.message === 'string' && body.message.trim()) ||
        upgradeCopyForQuota(quota),
      code: code || 'prompt_quota_exceeded',
    }
  }

  if (status === 403 || code === 'account_required') {
    return {
      ok: false,
      exhausted: false,
      quota,
      operatorMessage:
        (typeof body?.message === 'string' && body.message.trim()) ||
        explainGovernanceGate({ code: 'account_required' }).message,
      code: code || 'account_required',
    }
  }

  if (!body?.ok || status >= 400) {
    return {
      ok: false,
      exhausted: false,
      quota,
      operatorMessage:
        (typeof body?.message === 'string' && body.message.trim()) ||
        'Could not resolve agent prompt quota.',
      code,
    }
  }

  return {
    ok: true,
    exhausted: false,
    quota,
    operatorMessage: null,
    code: null,
  }
}

/** Tool catalog entry exposed on /api/session.tools */
export function promptQuotaToolCatalog() {
  return {
    name: 'promptQuota',
    aliases: ['checkPromptQuota', 'consumePromptQuota'] as const,
    description:
      'Check (GET) or consume (POST) Free agent prompt quota before heavy codegen. On 402 tell operator to upgrade.',
    check: { method: 'GET' as const, path: BRIDGE_PROMPT_QUOTA_PATH },
    consume: { method: 'POST' as const, path: BRIDGE_PROMPT_QUOTA_PATH },
  }
}
