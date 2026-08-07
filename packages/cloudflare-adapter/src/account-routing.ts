/**
 * Account creation happens in chat — never via a Start building / OTP popup.
 */

/** Hard gate: Guest must finish OTP account before any other agent work. */
export const ACCOUNT_IN_CHAT_RULES = `GUEST ACCOUNT GATE (HARD — do this FIRST before any other task): If Guest / no email / not signed in, BEFORE docs, design, code, launch, enable, or any other work: (1) briefly acknowledge their request, (2) collect name + email + Privacy Policy & Terms (DPDP) consent in chat, (3) POST /auth/start with { name, email, dpdpConsent: true }, (4) ask for the email OTP code, (5) POST /auth/verify with { name, email, token }. Only after verify returns ok, continue with their original request in the same workspace. Never open /start or a registration modal. Never skip this gate.`

/** Prepended at the front of agent_hint / bootstrap when guest:true so the agent cannot miss it. */
export const GUEST_ACCOUNT_FIRST_HINT = `GUEST ACCOUNT GATE (HARD — FIRST): Operator is not signed in. Before ANY other task (docs, design, code, launch, enable), complete Indobase account in chat: acknowledge their request → collect name+email+DPDP/Privacy/Terms consent → POST /auth/start { name, email, dpdpConsent: true } → OTP → POST /auth/verify { name, email, token }. Only after ok, continue the original user request. Never skip auth.`

export const ACCOUNT_AUTH_START = '/auth/start'
export const ACCOUNT_AUTH_VERIFY = '/auth/verify'
