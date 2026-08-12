/**
 * CFOS OpenRouter model policy — chat / org / code tiers.
 *
 * Operators never pick models. Server seeds an approved pool and routes by task:
 *   chat  → cheap (discuss, niche, clarify)
 *   org   → fast/cheap (journey, OTP, follow-ups, titles)
 *   code  → quality (build, repair, launch HTML, guidedBackend)
 *
 * Never fall through to unlisted models (e.g. openai/gpt-3.5-turbo).
 */

export type CfosModelTask = 'chat' | 'org' | 'code'

export type CfosModelTier = 'chat' | 'org' | 'code'

export type CfosApprovedModel = {
  id: string
  name: string
  tier: CfosModelTier
  /** Preferred coding model for agent turns */
  preferred?: boolean
  /** Quick model for titles / light org work */
  quick?: boolean
}

/** Curated OpenRouter ids only — cheap paid, not `:free` (free tier 429s independently of credits). */
export const CFOS_APPROVED_MODELS: readonly CfosApprovedModel[] = [
  {
    id: 'openai/gpt-5.6-luna',
    name: 'GPT 5.6 Luna (OpenRouter)',
    tier: 'code',
    preferred: true,
  },
  {
    id: 'openai/gpt-5.6-terra',
    name: 'GPT 5.6 Terra (OpenRouter)',
    tier: 'org',
    quick: true,
  },
  {
    id: 'openai/gpt-oss-120b',
    name: 'GPT-OSS 120B (OpenRouter)',
    tier: 'chat',
  },
  {
    id: 'qwen/qwen3-coder-30b-a3b-instruct',
    name: 'Qwen3 Coder 30B (OpenRouter)',
    tier: 'code',
  },
] as const

export const CFOS_CODE_MODEL = 'openai/gpt-5.6-luna'
export const CFOS_ORG_MODEL = 'openai/gpt-5.6-terra'
export const CFOS_CHAT_MODEL = 'openai/gpt-oss-120b'

const APPROVED_IDS = new Set(CFOS_APPROVED_MODELS.map((m) => m.id))

export function isApprovedCfosModelId(id: string | null | undefined): boolean {
  if (!id) return false
  return APPROVED_IDS.has(id.trim())
}

export function approvedCfosModelIds(): string[] {
  return CFOS_APPROVED_MODELS.map((m) => m.id)
}

export function preferredCfosModelId(): string {
  return CFOS_APPROVED_MODELS.find((m) => m.preferred)?.id || CFOS_CODE_MODEL
}

export function quickCfosModelId(): string {
  return CFOS_APPROVED_MODELS.find((m) => m.quick)?.id || CFOS_ORG_MODEL
}

/** Failover order within a task tier, then step up to quality. */
export function failoverOrderForTask(task: CfosModelTask): string[] {
  switch (task) {
    case 'code':
      return [
        CFOS_CODE_MODEL,
        CFOS_ORG_MODEL,
        'qwen/qwen3-coder-30b-a3b-instruct',
        CFOS_CHAT_MODEL,
      ]
    case 'org':
      return [CFOS_ORG_MODEL, CFOS_CHAT_MODEL, CFOS_CODE_MODEL]
    case 'chat':
    default:
      return [CFOS_CHAT_MODEL, CFOS_ORG_MODEL, CFOS_CODE_MODEL]
  }
}

export function resolveCfosModelForTask(task: CfosModelTask): string {
  return failoverOrderForTask(task)[0]
}

/**
 * Pick first approved id present in `available`, following task failover order.
 * Returns null if none of the approved pool is available (do not use random models[0]).
 */
export function pickApprovedModel(
  available: readonly { id: string }[],
  task: CfosModelTask = 'code',
): string | null {
  const have = new Set(available.map((m) => m.id))
  for (const id of failoverOrderForTask(task)) {
    if (have.has(id)) return id
  }
  for (const m of available) {
    if (isApprovedCfosModelId(m.id)) return m.id
  }
  return null
}

/** Next model after a rate-limit / upstream failure. */
export function nextFailoverModel(
  currentId: string,
  task: CfosModelTask = 'code',
): string | null {
  const order = failoverOrderForTask(task)
  const idx = order.indexOf(currentId)
  if (idx < 0) return order[0] || null
  return order[idx + 1] || null
}

export function isRateLimitErrorMessage(message: string): boolean {
  const t = (message || '').toLowerCase()
  return (
    t.includes('rate_limit') ||
    t.includes('rate-limit') ||
    t.includes('rate limited') ||
    t.includes('temporarily rate-limited') ||
    /\b429\b/.test(t)
  )
}

/**
 * Classify operator message for model tier (heuristic — UI still prefers Luna for agent turns;
 * chat/org used for titles + policy docs; code for build).
 */
export function classifyOperatorMessageTask(message: string): CfosModelTask {
  const t = (message || '').toLowerCase()
  if (
    /\b(build|codegen|create|scaffold|html|css|storefront|admin\.html|guidedbackend|launchbusiness|applyschema|fix|repair|wire|implement)\b/.test(
      t,
    )
  ) {
    return 'code'
  }
  if (
    /\b(sign.?in|otp|account|payment|razorpay|stripe|domain|checklist|quota|upgrade|analytics|session)\b/.test(
      t,
    )
  ) {
    return 'org'
  }
  if (
    /\b(what|which|niche|recommend|suggest|explain|how should|where next|chip)\b/.test(t) ||
    t.length < 80
  ) {
    return 'chat'
  }
  // Default store/launch asks → code quality
  if (/\b(store|shop|website|app|saas|landing)\b/.test(t)) return 'code'
  return 'chat'
}
