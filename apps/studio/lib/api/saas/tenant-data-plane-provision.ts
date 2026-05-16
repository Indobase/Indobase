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
