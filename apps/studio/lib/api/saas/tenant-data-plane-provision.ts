import type { JwtPayload } from 'indobase-js'

import {
  getTenantStackArtifacts,
  recordDataPlaneProvisionSuccess,
  resolvePublicDomainForTenantStack,
} from './platform'

type Claims = JwtPayload & Record<string, unknown>

export function isDataPlaneProvisionerConfigured(): boolean {
  const provisionerUrl = (process.env.DATA_PLANE_PROVISIONER_URL || '').trim()
  const provisionerToken = (process.env.DATA_PLANE_PROVISIONER_TOKEN || '').trim()
  return Boolean(provisionerUrl && provisionerToken)
}

export async function provisionTenantDataPlaneStack({
  claims,
  ref,
  apply = true,
  reason,
}: {
  claims: Claims
  ref: string
  apply?: boolean
  reason?: string
}): Promise<{ ok: true; applied: boolean; provisioner_status: number }> {
  const provisionerUrl = (process.env.DATA_PLANE_PROVISIONER_URL || '').trim().replace(/\/$/, '')
  const provisionerToken = (process.env.DATA_PLANE_PROVISIONER_TOKEN || '').trim()
  if (!provisionerUrl || !provisionerToken) {
    throw new Error(
      'Data-plane provisioner is not configured. Set DATA_PLANE_PROVISIONER_URL and DATA_PLANE_PROVISIONER_TOKEN on the Studio service.'
    )
  }

  const publicDomain = resolvePublicDomainForTenantStack()
  const artifacts = await getTenantStackArtifacts({ claims, ref, publicDomain })
  if (!artifacts) {
    throw new Error(
      'No dedicated tenant database for this project. Per-project stacks require a provisioned tenant Postgres database.'
    )
  }

  const resp = await fetch(`${provisionerUrl}/provision`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${provisionerToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      project_ref: ref,
      docker_compose_yml: artifacts.docker_compose_yml,
      traefik_yml: artifacts.traefik_yml,
      apply,
    }),
  })

  const text = await resp.text()
  let parsed: unknown
  try {
    parsed = text ? JSON.parse(text) : {}
  } catch {
    parsed = { raw: text }
  }

  if (!resp.ok) {
    throw new Error(
      `Data-plane provisioner failed (${resp.status}): ${
        typeof parsed === 'object' && parsed && 'message' in parsed
          ? String((parsed as { message?: unknown }).message)
          : text.slice(0, 200)
      }`
    )
  }

  const extra = typeof parsed === 'object' && parsed !== null ? parsed : {}
  await recordDataPlaneProvisionSuccess({
    claims,
    ref,
    provisionResult: {
      ok: true,
      apply,
      ...(reason ? { reason } : {}),
      provisioner_status: resp.status,
      ...(extra as Record<string, unknown>),
    },
  })

  return { ok: true, applied: apply, provisioner_status: resp.status }
}

/**
 * Stops the per-project Docker Compose stack, removes Traefik routing, and best-effort removes
 * the Edge Functions seed volume. Requires the same provisioner env as {@link provisionTenantDataPlaneStack}.
 * When the provisioner is not configured, returns without doing I/O.
 */
export async function teardownTenantDataPlaneStack({
  ref,
  apply = true,
}: {
  ref: string
  apply?: boolean
}): Promise<{ ok: true; applied: boolean; provisioner_status: number }> {
  const provisionerUrl = (process.env.DATA_PLANE_PROVISIONER_URL || '').trim().replace(/\/$/, '')
  const provisionerToken = (process.env.DATA_PLANE_PROVISIONER_TOKEN || '').trim()
  if (!provisionerUrl || !provisionerToken) {
    return { ok: true, applied: false, provisioner_status: 0 }
  }

  const resp = await fetch(`${provisionerUrl}/teardown`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${provisionerToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      project_ref: ref,
      apply,
    }),
  })

  const text = await resp.text()
  let parsed: unknown
  try {
    parsed = text ? JSON.parse(text) : {}
  } catch {
    parsed = { raw: text }
  }

  if (!resp.ok) {
    throw new Error(
      `Data-plane provisioner teardown failed (${resp.status}): ${
        typeof parsed === 'object' && parsed && 'message' in parsed
          ? String((parsed as { message?: unknown }).message)
          : text.slice(0, 200)
      }`
    )
  }

  return { ok: true, applied: apply, provisioner_status: resp.status }
}

function claimsFromActorId(actorId: string): Claims {
  return { sub: actorId } as Claims
}

/**
 * When a project has a dedicated tenant DB but no data_plane_last_provisioned_at, apply the
 * tenant stack (idempotent) so health checks stop reporting COMING_UP.
 */
export async function ensureDataPlaneProvisionedIfMissing({
  claims,
  ref,
  reason = 'auto_repair',
}: {
  claims: Claims
  ref: string
  reason?: string
}): Promise<{ repaired: boolean }> {
  if (!isDataPlaneProvisionerConfigured()) {
    return { repaired: false }
  }

  const normalized: any =
    claims && typeof (claims as any).claims === 'object' ? (claims as any).claims : claims
  const actorId: string | undefined = normalized?.sub
  if (!actorId) return { repaired: false }

  const { executeQuery } = await import('./query')
  const { decryptString } = await import('./util')

  const row = await executeQuery<{
    connection_string: string | null
    connection_string_enc: string | null
    data_plane_last_provisioned_at: string | null
  }>({
    query: `
      select p.connection_string, p.connection_string_enc, p.data_plane_last_provisioned_at
      from saas.projects p
      join saas.organization_members m on m.organization_id = p.organization_id
      where p.ref = $1 and m.gotrue_id = $2
      limit 1
    `,
    parameters: [ref, actorId],
    actorId,
  })
  if (row.error) throw row.error
  const p = row.data?.[0]
  if (!p) return { repaired: false }

  const enc = (p.connection_string_enc ?? '').trim()
  const tenantUrl = enc.length > 0 ? decryptString(enc) : p.connection_string
  if (!tenantUrl?.trim() || p.data_plane_last_provisioned_at) {
    return { repaired: false }
  }

  await provisionTenantDataPlaneStack({ claims, ref, apply: true, reason })
  return { repaired: true }
}

export async function ensureDataPlaneProvisionedIfMissingForActor({
  ref,
  actorId,
  reason,
}: {
  ref: string
  actorId: string
  reason?: string
}) {
  return ensureDataPlaneProvisionedIfMissing({
    claims: claimsFromActorId(actorId),
    ref,
    reason,
  })
}
