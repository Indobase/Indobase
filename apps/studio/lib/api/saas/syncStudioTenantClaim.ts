import type { JwtPayload } from 'indobase-js'

import { getOrganization } from 'lib/api/saas/platform'
import { getStorageAdminClient } from 'lib/api/storage-admin'
import { saasOrganizationIdToTenantUuid } from 'lib/saas-organization-tenant-uuid'

type Claims = JwtPayload & Record<string, any>

function resolveGotrueUserId(claims: Claims): string {
  const normalized: any =
    claims && typeof (claims as any).claims === 'object' ? (claims as any).claims : claims

  const id =
    normalized.sub ??
    normalized.id ??
    normalized.uid ??
    normalized.user_metadata?.sub ??
    normalized.user_metadata?.id ??
    normalized.user_metadata?.user_id ??
    normalized.user_id ??
    normalized.gotrue_id ??
    normalized.user?.id ??
    normalized.app_metadata?.sub

  if (typeof id !== 'string' || !id) {
    throw new Error('Missing GoTrue user id in JWT claims')
  }
  return id
}

export type SyncStudioTenantClaimResult =
  | { ok: true; tenant_id: string; skipped?: boolean }
  | { ok: false; message: string; status?: number }

/**
 * Sets `app_metadata.tenant_id` (stable uuid from org id) for the signed-in user,
 * after verifying membership via `getOrganization`.
 */
export async function syncStudioUserTenantClaim({
  claims,
  organizationSlug,
}: {
  claims: Claims
  organizationSlug: string
}): Promise<SyncStudioTenantClaimResult> {
  const slug = organizationSlug.trim()
  if (!slug) {
    return { ok: false, message: 'organizationSlug is required', status: 400 }
  }

  const org = await getOrganization({ claims, slug })
  if (!org) {
    return { ok: false, message: 'Organization not found or access denied', status: 403 }
  }

  const tenantId = saasOrganizationIdToTenantUuid(org.id)
  let admin: ReturnType<typeof getStorageAdminClient>
  try {
    admin = getStorageAdminClient()
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return { ok: false, message: `Auth admin unavailable: ${message}`, status: 503 }
  }

  const gotrueId = resolveGotrueUserId(claims)

  const { data: existing, error: getErr } = await admin.auth.admin.getUserById(gotrueId)
  if (getErr) {
    return { ok: false, message: getErr.message, status: 500 }
  }

  const prev = (existing.user?.app_metadata ?? {}) as Record<string, unknown>
  if (prev.tenant_id === tenantId && prev.saas_organization_id === org.id) {
    return { ok: true, tenant_id: tenantId, skipped: true }
  }

  const app_metadata = {
    ...prev,
    tenant_id: tenantId,
    saas_organization_id: org.id,
  }

  const { error: upErr } = await admin.auth.admin.updateUserById(gotrueId, { app_metadata })
  if (upErr) {
    return { ok: false, message: upErr.message, status: 500 }
  }

  return { ok: true, tenant_id: tenantId }
}
