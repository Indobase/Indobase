/**
 * Account creation: chat OTP and/or Create account modal chrome.
 * Never send operators through Studio plan wizards before first build.
 */

/** Hard gate: Guest must finish OTP account before any other agent work. */
export const ACCOUNT_IN_CHAT_RULES = `GUEST ACCOUNT GATE (HARD — do this FIRST before any other task): If Guest / no email / not signed in, BEFORE docs, design, code, launch, enable, or any other work: (1) briefly acknowledge their request, (2) collect name + email + Privacy Policy & Terms (DPDP) consent in chat OR open Create account, (3) POST /auth/start with { name, email, dpdpConsent: true }, (4) ask for the email OTP code, (5) POST /auth/verify with { name, email, token }. Only after verify returns ok, continue with their original request in the same workspace. Prefer Create account / auth modal if chat OTP stalls. Never open Studio signup/plan wizards. Never skip this gate.`

/** Prepended at the front of agent_hint / bootstrap when guest:true so the agent cannot miss it. */
export const GUEST_ACCOUNT_FIRST_HINT = `GUEST ACCOUNT GATE (HARD — FIRST): Operator is not signed in. Before ANY other task (docs, design, code, launch, enable), complete Indobase account in chat (name+email+DPDP → POST /auth/start → OTP → POST /auth/verify) or via Create account. Only after ok, continue the original user request. Never skip auth. Never open Studio plan wizards.`

export const ACCOUNT_AUTH_START = '/auth/start'
export const ACCOUNT_AUTH_VERIFY = '/auth/verify'
