import type { components } from 'api-types'
import type { JwtPayload } from 'indobase-js'

import { decryptString } from './util'
import { executeQuery } from './query'
import {
  buildDefaultGoTrueConfig,
  type GoTrueConfigResponse,
} from './gotrue-config.defaults'
import { ensureSaasTables, getGotrueUserId } from './platform'
import { resolveSaaSTenantRestUrls } from './tenant-public-urls'

type GoTruePublicSettings = {
  disable_signup?: boolean
  mailer_autoconfirm?: boolean
  phone_autoconfirm?: boolean
  external?: Record<string, boolean>
}

async function fetchGoTruePublicSettings(
  apiOrigin: string,
  apiKey: string
): Promise<GoTruePublicSettings | null> {
  try {
    const res = await fetch(`${apiOrigin}/auth/v1/settings`, {
      headers: {
        apikey: apiKey,
        Authorization: `Bearer ${apiKey}`,
      },
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return null
    return (await res.json()) as GoTruePublicSettings
  } catch {
    return null
  }
}

function applyPublicSettings(config: GoTrueConfigResponse, live: GoTruePublicSettings) {
  if (typeof live.disable_signup === 'boolean') {
    config.DISABLE_SIGNUP = live.disable_signup
  }
  if (typeof live.mailer_autoconfirm === 'boolean') {
    config.MAILER_AUTOCONFIRM = live.mailer_autoconfirm
  }
  if (typeof live.phone_autoconfirm === 'boolean') {
    config.SMS_AUTOCONFIRM = live.phone_autoconfirm
  }
  const external = live.external
  if (external && typeof external === 'object') {
    if (typeof external.email === 'boolean') config.EXTERNAL_EMAIL_ENABLED = external.email
    if (typeof external.phone === 'boolean') config.EXTERNAL_PHONE_ENABLED = external.phone
    if (typeof external.github === 'boolean') config.EXTERNAL_GITHUB_ENABLED = external.github
    if (typeof external.google === 'boolean') config.EXTERNAL_GOOGLE_ENABLED = external.google
    if (typeof external.apple === 'boolean') config.EXTERNAL_APPLE_ENABLED = external.apple
    if (typeof external.saml === 'boolean') config.SAML_ENABLED = external.saml
  }
}

async function loadProjectAuthContext(ref: string, gotrueId: string) {
  const row = await executeQuery<{
    anon_key: string
    anon_key_enc: string | null
    connection_string: string | null
    connection_string_enc: string | null
    data_plane_last_provisioned_at: string | null
    auth_config: Record<string, unknown> | null
  }>({
    query: `
      select
        p.anon_key,
        p.anon_key_enc,
        p.connection_string,
        p.connection_string_enc,
        p.data_plane_last_provisioned_at,
        p.auth_config
      from saas.projects p
      join saas.organization_members m on m.organization_id = p.organization_id
      where p.ref = $1 and m.gotrue_id = $2
      limit 1
    `,
    parameters: [ref, gotrueId],
    actorId: gotrueId,
  })
  if (row.error) throw row.error
  if (!row.data?.length) return null

  const p = row.data[0]!
  const anonKey = p.anon_key_enc?.trim() ? decryptString(p.anon_key_enc) : p.anon_key
  const tenantDbUrl =
    p.connection_string_enc?.trim()
      ? decryptString(p.connection_string_enc)
      : p.connection_string
  const hasDedicated = Boolean(tenantDbUrl?.trim())
  const hasProvisioned = Boolean(p.data_plane_last_provisioned_at)
  const { endpointHost, protocol } = resolveSaaSTenantRestUrls(
    ref,
    hasDedicated && hasProvisioned
  )
  const apiOrigin = `${protocol}://${endpointHost}`

  return {
    anonKey,
    apiOrigin,
    siteUrl: apiOrigin,
    storedConfig: (p.auth_config ?? {}) as Partial<GoTrueConfigResponse>,
  }
}

export async function getProjectGoTrueConfig({
  claims,
  ref,
}: {
  claims: JwtPayload
  ref: string
}): Promise<GoTrueConfigResponse | null> {
  await ensureSaasTables()
  const gotrueId = getGotrueUserId(claims as JwtPayload & Record<string, unknown>)
  const ctx = await loadProjectAuthContext(ref, gotrueId)
  if (!ctx) return null

  const config = buildDefaultGoTrueConfig(ctx.siteUrl, ctx.siteUrl)
  const hasStoredOverrides = Object.keys(ctx.storedConfig).length > 0

  if (hasStoredOverrides) {
    Object.assign(config, ctx.storedConfig)
  } else {
    const live = await fetchGoTruePublicSettings(ctx.apiOrigin, ctx.anonKey)
    if (live) applyPublicSettings(config, live)
  }

  return normalizeAuthConfigNumbers(config)
}

function normalizeAuthConfigNumbers(config: GoTrueConfigResponse): GoTrueConfigResponse {
  return {
    ...config,
    SESSIONS_TIMEBOX: config.SESSIONS_TIMEBOX ?? 0,
    SESSIONS_INACTIVITY_TIMEOUT: config.SESSIONS_INACTIVITY_TIMEOUT ?? 0,
    SECURITY_REFRESH_TOKEN_REUSE_INTERVAL: config.SECURITY_REFRESH_TOKEN_REUSE_INTERVAL ?? 10,
  }
}

export async function updateProjectGoTrueConfig({
  claims,
  ref,
  patch,
}: {
  claims: JwtPayload
  ref: string
  patch: Partial<components['schemas']['UpdateGoTrueConfigBody']>
}): Promise<GoTrueConfigResponse | null> {
  await ensureSaasTables()
  const gotrueId = getGotrueUserId(claims as JwtPayload & Record<string, unknown>)
  const current = await getProjectGoTrueConfig({ claims, ref })
  if (!current) return null

  const merged = { ...current, ...patch }

  const updated = await executeQuery<{ ref: string }>({
    query: `
      update saas.projects p
      set auth_config = $1::jsonb
      from saas.organization_members m
      where p.ref = $2
        and m.organization_id = p.organization_id
        and m.gotrue_id = $3
        and m.role in ('owner', 'admin', 'developer')
      returning p.ref
    `,
    parameters: [JSON.stringify(merged), ref, gotrueId],
    actorId: gotrueId,
  })
  if (updated.error) throw updated.error
  if (!updated.data?.length) {
    throw new Error('Project not found or insufficient permissions to update auth configuration')
  }

  return normalizeAuthConfigNumbers(merged)
}

export async function updateProjectGoTrueConfigHooks({
  claims,
  ref,
  patch,
}: {
  claims: JwtPayload
  ref: string
  patch: components['schemas']['UpdateGoTrueConfigHooksBody']
}): Promise<GoTrueConfigResponse | null> {
  const hookKeys = Object.keys(patch).filter((k) => k.startsWith('HOOK_')) as (keyof typeof patch)[]
  const hookPatch = Object.fromEntries(hookKeys.map((k) => [k, patch[k]])) as Partial<
    components['schemas']['UpdateGoTrueConfigBody']
  >
  return updateProjectGoTrueConfig({ claims, ref, patch: hookPatch })
}
