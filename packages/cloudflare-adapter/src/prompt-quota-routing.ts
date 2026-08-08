/**
 * Free-plan agent prompt metering — ChatInterface hard-enforces via begin-turn;
 * agents should still check/consume on heavy tool paths.
 * Shares Builder meter (saas.organizations.builder_prompts_used).
 */

export const PROMPT_QUOTA_CHECK_PATH = '/api/os/usage/prompt-quota'
export const PROMPT_QUOTA_CONSUME_PATH = '/api/os/usage/prompt-quota'
export const AGENT_BEGIN_TURN_PATH = '/api/os/agent/begin-turn'

export const PROMPT_QUOTA_EXHAUSTED_OPERATOR_COPY =
  'Free agent limit reached (5 prompts). Upgrade your plan to continue building with Indobase.'

/** Hard rules appended to signed-in agent hints / instanceInstructions. */
export const PROMPT_QUOTA_AGENT_RULES = `
## Agent prompt quota (HARD)

Signed-in Free operators share a 5-prompt meter with Builder (same org limit).

Runtime: ChatInterface calls POST ${AGENT_BEGIN_TURN_PATH} before each user send (hard enforce).
On heavy tool paths / codegen outside the chat composer, still:
1. GET ${PROMPT_QUOTA_CHECK_PATH} (check remaining). Guests get account_required — finish OTP first.
2. If remaining is 0 OR the response is 402 / code prompt_quota_exceeded: tell the operator
   "${PROMPT_QUOTA_EXHAUSTED_OPERATOR_COPY}" and quote upgradeUrl from the JSON when present.
   Do not continue heavy work. Do not invent remaining prompts.
3. Otherwise POST ${PROMPT_QUOTA_CONSUME_PATH} to consume one prompt, then proceed with the work.
4. Light Q&A already metered by begin-turn; when unsure on Free for tool-only paths, prefer check then consume.
`.trim()

/** Compact one-liner for session hint bags. */
export const PROMPT_QUOTA_SESSION_HINT =
  'Prompt quota: ChatInterface meters via POST /api/os/agent/begin-turn; on heavy tools still GET then POST /api/os/usage/prompt-quota. On 402/exhausted tell operator to upgrade (Free 5-prompt meter). Guests must finish account first.'
