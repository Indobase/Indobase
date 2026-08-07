/**
 * Free-plan agent prompt metering — agents must check/consume via bridge API.
 * Shares Builder meter (saas.organizations.builder_prompts_used).
 *
 * CFOS runtime does not auto-intercept every chat turn; agents (and any future
 * bridge middleware) must call these endpoints before heavy codegen.
 */

export const PROMPT_QUOTA_CHECK_PATH = '/api/os/usage/prompt-quota'
export const PROMPT_QUOTA_CONSUME_PATH = '/api/os/usage/prompt-quota'

export const PROMPT_QUOTA_EXHAUSTED_OPERATOR_COPY =
  'Free agent limit reached (5 prompts). Upgrade your plan to continue building with Indobase.'

/** Hard rules appended to signed-in agent hints / instanceInstructions. */
export const PROMPT_QUOTA_AGENT_RULES = `
## Agent prompt quota (HARD — before heavy codegen)

Signed-in Free operators share a 5-prompt meter with Builder (same org limit).

Before heavy codegen, multi-file generation, or a significant build turn:
1. GET ${PROMPT_QUOTA_CHECK_PATH} (check remaining). Guests get account_required — finish OTP first.
2. If remaining is 0 OR the response is 402 / code prompt_quota_exceeded: tell the operator
   "${PROMPT_QUOTA_EXHAUSTED_OPERATOR_COPY}" and quote upgradeUrl from the JSON when present.
   Do not continue heavy work. Do not invent remaining prompts.
3. Otherwise POST ${PROMPT_QUOTA_CONSUME_PATH} to consume one prompt, then proceed with the work.
4. Light Q&A / status checks do not need a consume; when unsure on Free, prefer check then consume.

CFOS does not auto-meter every chat turn yet — you MUST call these endpoints yourself on
agent turns that do heavy work until a runtime hook exists.
`.trim()

/** Compact one-liner for session hint bags. */
export const PROMPT_QUOTA_SESSION_HINT =
  'Prompt quota: before heavy codegen GET then POST /api/os/usage/prompt-quota. On 402/exhausted tell operator to upgrade (Free 5-prompt meter). Guests must finish account first.'
