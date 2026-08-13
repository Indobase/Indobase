/**
 * ensureLogin / ensureDatabase — hard paths wrapping runtime/ensure for any web app.
 */

import { platformRuntimeEnsure } from './platform-api-client.js'

export const ENSURE_LOGIN_TOOL = {
  name: 'ensureLogin',
  aliases: ['enableLogin', 'addLogin', 'ensure_login'] as const,
  description:
    'Enable customer login BEFORE building UI that needs Sign-in (Indobase Auth). Returns Login enabled + backend tips. ' +
    'Wire Sign-in CTA to session.backend. Do not use webFetch. Never connect an external auth product.',
  method: 'POST' as const,
  path: '/api/os/tools/ensureLogin',
  wraps: '/api/os/runtime/ensure',
  parameters: { type: 'object', properties: {} },
} as const

export const ENSURE_DATABASE_TOOL = {
  name: 'ensureDatabase',
  aliases: ['enableDatabase', 'ensureBusinessData', 'ensure_database'] as const,
  description:
    'Enable the customer database BEFORE building UI that needs data (businessData). ' +
    'Then applySchema (or setupShopCatalog / guidedBackend). Build against session.backend — never invent API URLs. Do not use webFetch.',
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

export const ANALYTICS_UNAVAILABLE_CODE = 'analytics_unavailable' as const

export const ANALYTICS_UNAVAILABLE_MESSAGE =
  'Indobase Analytics is not available on this CFOS / managed-backend launch path. Skip analytics; continue with domain, payments, or productionChecklist. Do not claim Analytics live.'

export const ENSURE_ANALYTICS_TOOL = {
  name: 'ensureAnalytics',
  aliases: ['ensureEvents', 'enableAnalytics', 'ensure_analytics'] as const,
  description:
    'Analytics is unavailable on this CFOS launch path (Studio Analytics stripped). ' +
    'Returns pending_setup + analytics_unavailable — do not call unless the operator asks; never claim Analytics live. Do not use webFetch.',
  method: 'POST' as const,
  path: '/api/os/tools/ensureAnalytics',
  wraps: '/api/os/runtime/ensure',
  parameters: { type: 'object', properties: {} },
} as const

export const ENSURE_CAPABILITY_AGENT_HARD_RULES = `
## Enable capabilities (HARD — ensure-first for apps that need a backend)

**Do not build UI against a missing backend.** Classify early, then:

### Landing / marketing only (no accounts, no app data)
Build UI → launchBusiness. Skip ensure*.

### SaaS / booking / blog-with-CMS / dashboard / any app with login or data
1. **ensureLogin** (if accounts) and/or **ensureDatabase** FIRST — wait for ok / claim_*_ready.
2. **applySchema** (or **guidedBackend** / **setupShopCatalog** for shops) BEFORE writing screens that read/write data.
3. **Build UI** wired to session.backend records API:
   - \`api_url\` + \`public_env.INDOBASE_COLLECTION_PREFIX\` (physical name = prefix + logical table)
   - Records: \`GET/POST {api}/api/collections/{physical}/records\`
   - Auth: users OTP on \`{api}/api/collections/users\` — Bearer **user** token (anon_key is \`public\`, not Kong)
   Never invent Neon/Firebase URLs or PostgREST \`/rest/v1\` / \`/auth/v1\` paths on the managed backend.
4. **launchBusiness** when the real UI is ready.
5. Optional **ensureEmail** only when asked — quote pending_setup + launch_url; do not block Go Live. **Do NOT offer ensureAnalytics / Add analytics chips** — Analytics is stripped on this CFOS path (returns analytics_unavailable).
6. Do NOT use webFetch for ensure. Do NOT say Connect Neon/Coolify/Postgres/Docker/Firebase/Mailchimp.
7. Do NOT claim “production ready” until productionChecklist returns claim_production_ready:true.
8. Prefer **guidedBackend** for ecommerce or “Add a real backend” to run ensureDatabase → schema/catalog in one call.
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
          ? 'Business data is ready — applySchema (or guidedBackend) next, then build UI against session.backend'
          : 'Could not enable database',
    next_hint: claim
      ? 'ENSURE_FIRST_OK: applySchema or guidedBackend, then build UI against session.backend records API (INDOBASE_COLLECTION_PREFIX + /api/collections/…/records). Do not invent third-party databases or /rest/v1 on managed backend.'
      : undefined,
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
        : 'Email is enabled — finish sender setup',
  }
}

/**
 * Soft-disable: Studio Analytics product is stripped from the CFOS / PocketBase
 * launch path. Do not call platform ensure (events) — that hits a dead Studio
 * control plane and surfaces opaque 502s. Honest pending_setup instead.
 */
export async function executeEnsureAnalytics(_session: {
  gotrueId: string
  email: string
  projectRef: string
}) {
  return {
    ok: true,
    capability: 'events',
    capabilityId: 'events',
    status: 'enabled' as const,
    provision_state: 'none',
    setup_status: 'pending' as const,
    launch_url: null,
    code: ANALYTICS_UNAVAILABLE_CODE,
    tool: 'ensureAnalytics' as const,
    claim_analytics_ready: false,
    message: ANALYTICS_UNAVAILABLE_MESSAGE,
    httpStatus: 200,
  }
}
