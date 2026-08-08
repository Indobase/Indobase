/**
 * Product Auth mail (tenant GoTrue OTP From) — Indobase-native.
 * Fleet SMTP host/user/pass stay Indobase; operators optionally brand From name/email.
 */
import { getGotrueUserId, type Claims } from './platform'
import { executeQuery } from './query'
import { assertOsAccountForEnsure } from './os-ensurer-access'
import {
  AUTH_LOGIN_MAIL_NEXT_STEP,
  OS_PRODUCT_MAIL_KEY,
  asAuthConfigRecord,
  fleetDefaultFromEmail,
  fleetDefaultFromName,
  resolveProductMailerFromIdentity,
  statusMessageForProductMail,
  validateProductFromEmail,
  type OsProductMailConfig,
  type OsProductMailMode,
  type OsProductMailStatus,
} from './os-product-auth-mail-core'

export {
  AUTH_LOGIN_MAIL_NEXT_STEP,
  OS_PRODUCT_MAIL_KEY,
  fleetDefaultFromEmail,
  fleetDefaultFromName,
  parseOsProductMail,
  resolveProductMailerFromIdentity,
  statusMessageForProductMail,
  validateProductFromEmail,
  type OsProductMailConfig,
  type OsProductMailMode,
  type OsProductMailStatus,
} from './os-product-auth-mail-core'

export async function getOsProductAuthMail({
  claims,
  workspaceRef,
}: {
  claims: Claims
  workspaceRef: string
}): Promise<OsProductMailStatus> {
  const gotrueId = getGotrueUserId(claims)
  const access = assertOsAccountForEnsure({ gotrueId, workspaceRef })
  if (!access.ok) {
    const err = new Error(access.message) as Error & { statusCode?: number; code?: string }
    err.statusCode = access.statusCode
    err.code = access.code
    throw err
  }

  const rows = await executeQuery<{ auth_config: unknown }>({
    query: `
      select p.auth_config
      from saas.projects p
      join saas.organization_members m on m.organization_id = p.organization_id
      where p.ref = $1 and m.gotrue_id = $2
      limit 1
    `,
    parameters: [workspaceRef, gotrueId],
    actorId: gotrueId,
  })
  if (rows.error) throw rows.error
  if (!rows.data?.[0]) {
    const err = new Error('Workspace not found') as Error & { statusCode?: number }
    err.statusCode = 404
    throw err
  }

  const resolved = resolveProductMailerFromIdentity(rows.data[0].auth_config)
  const defaults = {
    default_from_email: fleetDefaultFromEmail(),
    default_from_name: fleetDefaultFromName(),
  }
  const status = {
    mode: resolved.mode,
    from_email: resolved.smtpAdminEmail,
    from_name: resolved.smtpSenderName,
    branded: resolved.branded,
    ...defaults,
  }
  return { ...status, message: statusMessageForProductMail(status) }
}

export async function updateOsProductAuthMail({
  claims,
  workspaceRef,
  mode,
  fromEmail,
  fromName,
}: {
  claims: Claims
  workspaceRef: string
  mode?: OsProductMailMode
  fromEmail?: string
  fromName?: string
}): Promise<OsProductMailStatus> {
  const gotrueId = getGotrueUserId(claims)
  const access = assertOsAccountForEnsure({ gotrueId, workspaceRef })
  if (!access.ok) {
    const err = new Error(access.message) as Error & { statusCode?: number; code?: string }
    err.statusCode = access.statusCode
    err.code = access.code
    throw err
  }

  const resolvedMode: OsProductMailMode =
    mode === 'indobase'
      ? 'indobase'
      : mode === 'branded'
        ? 'branded'
        : fromEmail || fromName
          ? 'branded'
          : 'indobase'

  let nextMail: OsProductMailConfig
  if (resolvedMode === 'indobase') {
    nextMail = { mode: 'indobase', updated_at: new Date().toISOString() }
  } else {
    const emailRaw = (fromEmail ?? '').trim()
    const validated = validateProductFromEmail(emailRaw || fleetDefaultFromEmail())
    if (!validated.ok) {
      const err = new Error(validated.message) as Error & { statusCode?: number }
      err.statusCode = 400
      throw err
    }
    const name = (fromName ?? '').trim() || fleetDefaultFromName()
    nextMail = {
      mode: 'branded',
      from_email: validated.email,
      from_name: name.slice(0, 80),
      updated_at: new Date().toISOString(),
    }
  }

  const rows = await executeQuery<{ auth_config: unknown }>({
    query: `
      select p.auth_config
      from saas.projects p
      join saas.organization_members m on m.organization_id = p.organization_id
      where p.ref = $1 and m.gotrue_id = $2
      limit 1
    `,
    parameters: [workspaceRef, gotrueId],
    actorId: gotrueId,
  })
  if (rows.error) throw rows.error
  if (!rows.data?.[0]) {
    const err = new Error('Workspace not found') as Error & { statusCode?: number }
    err.statusCode = 404
    throw err
  }

  const prev = asAuthConfigRecord(rows.data[0].auth_config)
  const merged: Record<string, unknown> = {
    ...prev,
    [OS_PRODUCT_MAIL_KEY]: nextMail,
  }
  if (nextMail.mode === 'branded' && nextMail.from_email) {
    merged.SMTP_ADMIN_EMAIL = nextMail.from_email
    merged.SMTP_SENDER_NAME = nextMail.from_name || fleetDefaultFromName()
  } else {
    merged.SMTP_ADMIN_EMAIL = fleetDefaultFromEmail()
    merged.SMTP_SENDER_NAME = fleetDefaultFromName()
  }

  const updated = await executeQuery({
    query: `
      update saas.projects p
      set auth_config = $2::jsonb
      where p.ref = $1
        and exists (
          select 1 from saas.organization_members m
          where m.organization_id = p.organization_id and m.gotrue_id = $3
        )
    `,
    parameters: [workspaceRef, JSON.stringify(merged), gotrueId],
    actorId: gotrueId,
  })
  if (updated.error) throw updated.error

  const { provisionTenantDataPlaneStack } = await import('./tenant-data-plane-provision')
  await provisionTenantDataPlaneStack({
    claims,
    ref: workspaceRef,
    apply: true,
    reason: 'os_product_auth_mail',
  })

  return getOsProductAuthMail({ claims, workspaceRef })
}
