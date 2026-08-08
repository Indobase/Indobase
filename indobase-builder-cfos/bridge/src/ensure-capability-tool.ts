/**
 * ensureLogin / ensureDatabase — hard paths wrapping runtime/ensure for any web app.
 */

import { platformRuntimeEnsure } from './platform-api-client.js'

export const ENSURE_LOGIN_TOOL = {
  name: 'ensureLogin',
  aliases: ['enableLogin', 'addLogin', 'ensure_login'] as const,
  description:
    'Enable customer login for this business (Indobase Auth). Returns Login enabled + next_steps. ' +
    'Then wire a Sign-in CTA. Do not use webFetch. Never connect an external auth product.',
  method: 'POST' as const,
  path: '/api/os/tools/ensureLogin',
  wraps: '/api/os/runtime/ensure',
  parameters: { type: 'object', properties: {} },
} as const

export const ENSURE_DATABASE_TOOL = {
  name: 'ensureDatabase',
  aliases: ['enableDatabase', 'ensureBusinessData', 'ensure_database'] as const,
  description:
    'Enable the customer database (businessData) for this business. ' +
    'Then call applySchema for the app data model (or setupShopCatalog for shops). Do not use webFetch.',
  method: 'POST' as const,
  path: '/api/os/tools/ensureDatabase',
  wraps: '/api/os/runtime/ensure',
  parameters: { type: 'object', properties: {} },
} as const

export const ENSURE_EMAIL_TOOL = {
  name: 'ensureEmail',
  aliases: ['enableEmail', 'ensure_email'] as const,
  description:
    'Enable Indobase Email for this business. Usually returns pending_setup + launch_url to finish sender setup. ' +
    'Do not claim Email enabled until setup is finished. Do not use webFetch.',
  method: 'POST' as const,
  path: '/api/os/tools/ensureEmail',
  wraps: '/api/os/runtime/ensure',
  parameters: { type: 'object', properties: {} },
} as const

export const ENSURE_ANALYTICS_TOOL = {
  name: 'ensureAnalytics',
  aliases: ['ensureEvents', 'enableAnalytics', 'ensure_analytics'] as const,
  description:
    'Enable Indobase Analytics for this business. Returns launch_url to finish site setup. ' +
    'Do not claim Analytics live from ensure alone. Do not use webFetch.',
  method: 'POST' as const,
  path: '/api/os/tools/ensureAnalytics',
  wraps: '/api/os/runtime/ensure',
  parameters: { type: 'object', properties: {} },
} as const

export const ENSURE_CAPABILITY_AGENT_HARD_RULES = `
## Enable capabilities (HARD PATH — any web app)

1. **Login:** **ensureLogin** — wire Sign-in CTA. Optional: /api/os/auth/mail for branded OTP From.
2. **Database:** **ensureDatabase** → **applySchema** (or setupShopCatalog for shops).
3. **Email:** **ensureEmail** — quote pending_setup + launch_url; finish sender setup before claiming Email enabled.
4. **Analytics:** **ensureAnalytics** — quote launch_url; finish site setup before claiming Analytics live.
5. Do NOT use webFetch. Do NOT say Connect Neon/Coolify/Postgres/Docker/Firebase/Mailchimp.
6. Do NOT claim “production ready” until productionChecklist returns claim_production_ready:true.
`.trim()

export function ensureLoginToolCatalog() {
  return {
    name: ENSURE_LOGIN_TOOL.name,
    aliases: [...ENSURE_LOGIN_TOOL.aliases],
    description: ENSURE_LOGIN_TOOL.description,
    method: ENSURE_LOGIN_TOOL.method,
    path: ENSURE_LOGIN_TOOL.path,
    wraps: ENSURE_LOGIN_TOOL.wraps,
    parameters: ENSURE_LOGIN_TOOL.parameters,
    rules: ENSURE_CAPABILITY_AGENT_HARD_RULES,
  }
}

export function ensureDatabaseToolCatalog() {
  return {
    name: ENSURE_DATABASE_TOOL.name,
    aliases: [...ENSURE_DATABASE_TOOL.aliases],
    description: ENSURE_DATABASE_TOOL.description,
    method: ENSURE_DATABASE_TOOL.method,
    path: ENSURE_DATABASE_TOOL.path,
    wraps: ENSURE_DATABASE_TOOL.wraps,
    parameters: ENSURE_DATABASE_TOOL.parameters,
  }
}

export function ensureEmailToolCatalog() {
  return {
    name: ENSURE_EMAIL_TOOL.name,
    aliases: [...ENSURE_EMAIL_TOOL.aliases],
    description: ENSURE_EMAIL_TOOL.description,
    method: ENSURE_EMAIL_TOOL.method,
    path: ENSURE_EMAIL_TOOL.path,
    wraps: ENSURE_EMAIL_TOOL.wraps,
    parameters: ENSURE_EMAIL_TOOL.parameters,
  }
}

export function ensureAnalyticsToolCatalog() {
  return {
    name: ENSURE_ANALYTICS_TOOL.name,
    aliases: [...ENSURE_ANALYTICS_TOOL.aliases],
    description: ENSURE_ANALYTICS_TOOL.description,
    method: ENSURE_ANALYTICS_TOOL.method,
    path: ENSURE_ANALYTICS_TOOL.path,
    wraps: ENSURE_ANALYTICS_TOOL.wraps,
    parameters: ENSURE_ANALYTICS_TOOL.parameters,
  }
}

export async function executeEnsureLogin(session: {
  gotrueId: string
  email: string
  projectRef: string
}) {
  const result = await platformRuntimeEnsure({
    gotrueId: session.gotrueId,
    email: session.email,
    workspaceRef: session.projectRef,
    capability: 'login',
  })
  const claim =
    result.ok === true && (result.status === 'enabled' || result.provision_state === 'ready')
  return {
    ...result,
    tool: 'ensureLogin' as const,
    claim_login_ready: claim,
    message:
      typeof result.message === 'string'
        ? result.message
        : claim
          ? 'Login enabled'
          : 'Could not enable login',
  }
}

export async function executeEnsureDatabase(session: {
  gotrueId: string
  email: string
  projectRef: string
}) {
  const result = await platformRuntimeEnsure({
    gotrueId: session.gotrueId,
    email: session.email,
    workspaceRef: session.projectRef,
    capability: 'businessData',
  })
  const claim =
    result.ok === true && (result.status === 'enabled' || result.provision_state === 'ready')
  return {
    ...result,
    tool: 'ensureDatabase' as const,
    claim_database_ready: claim,
    message:
      typeof result.message === 'string'
        ? result.message
        : claim
          ? 'Customer database ready — call applySchema next'
          : 'Could not enable database',
  }
}

export async function executeEnsureEmail(session: {
  gotrueId: string
  email: string
  projectRef: string
}) {
  const result = await platformRuntimeEnsure({
    gotrueId: session.gotrueId,
    email: session.email,
    workspaceRef: session.projectRef,
    capability: 'email',
  })
  return {
    ...result,
    tool: 'ensureEmail' as const,
    claim_email_ready: result.ok === true && result.setup_status === 'ready',
    message:
      typeof result.message === 'string'
        ? result.message
        : 'Email backend ready — finish sender setup',
  }
}

export async function executeEnsureAnalytics(session: {
  gotrueId: string
  email: string
  projectRef: string
}) {
  const result = await platformRuntimeEnsure({
    gotrueId: session.gotrueId,
    email: session.email,
    workspaceRef: session.projectRef,
    capability: 'events',
  })
  return {
    ...result,
    tool: 'ensureAnalytics' as const,
    claim_analytics_ready: result.ok === true && result.setup_status === 'ready',
    message:
      typeof result.message === 'string'
        ? result.message
        : 'Analytics backend ready — finish site setup',
  }
}
