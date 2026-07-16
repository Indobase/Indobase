import type { JwtPayload } from '@indobaseinc/indobase-js'

import { decryptString, encryptString } from './util'
import { ensureSaasTables, getGotrueUserId } from './platform'
import { executeQuery } from './query'
import {
  isDataPlaneProvisionerConfigured,
  provisionTenantDataPlaneStack,
} from './tenant-data-plane-provision'

type Claims = JwtPayload & Record<string, unknown>

const RESERVED_SECRET_PREFIX = /^SUPABASE_/i

function assertValidSecretName(name: string) {
  const trimmed = name.trim()
  if (!trimmed) throw new Error('Secret name is required')
  if (!/^[A-Z][A-Z0-9_]*$/.test(trimmed)) {
    throw new Error('Secret name must use uppercase letters, numbers, and underscores')
  }
  if (RESERVED_SECRET_PREFIX.test(trimmed)) {
    throw new Error('Secret name must not start with the SUPABASE_ prefix')
  }
  return trimmed
}

async function assertProjectAccess({
  claims,
  ref,
}: {
  claims: Claims
  ref: string
}) {
  await ensureSaasTables()
  const actorId = getGotrueUserId(claims)
  const result = await executeQuery<{ ref: string }>({
    query: `
      select p.ref
      from saas.projects p
      join saas.organization_members m on m.organization_id = p.organization_id
      where p.ref = $1
        and m.gotrue_id = $2
        and m.role in ('owner', 'admin', 'developer')
      limit 1
    `,
    parameters: [ref, actorId],
    actorId,
  })
  if (result.error) throw result.error
  if (!result.data?.length) throw new Error('Project not found')
}

export async function loadEdgeFunctionSecretsForCompose(
  ref: string
): Promise<Record<string, string>> {
  await ensureSaasTables()
  const result = await executeQuery<{ name: string; value_enc: string }>({
    query: `
      select name, value_enc
      from saas.project_edge_function_secrets
      where project_ref = $1
      order by name asc
    `,
    parameters: [ref],
  })
  if (result.error) throw result.error

  const secrets: Record<string, string> = {}
  for (const row of result.data ?? []) {
    try {
      secrets[row.name] = decryptString(row.value_enc)
    } catch {
      // Skip rows that cannot be decrypted.
    }
  }
  return secrets
}

export async function listEdgeFunctionSecrets({
  claims,
  ref,
}: {
  claims: Claims
  ref: string
}) {
  await assertProjectAccess({ claims, ref })
  const actorId = getGotrueUserId(claims)
  const result = await executeQuery<{ name: string; value_enc: string; updated_at: string }>({
    query: `
      select name, value_enc, updated_at
      from saas.project_edge_function_secrets
      where project_ref = $1
      order by name asc
    `,
    parameters: [ref],
    actorId,
  })
  if (result.error) throw result.error

  return (result.data ?? []).map((row) => ({
    name: row.name,
    value: decryptString(row.value_enc),
    updated_at: new Date(row.updated_at).toISOString(),
  }))
}

export async function createEdgeFunctionSecrets({
  claims,
  ref,
  secrets,
}: {
  claims: Claims
  ref: string
  secrets: { name: string; value: string }[]
}) {
  await assertProjectAccess({ claims, ref })
  if (!Array.isArray(secrets) || secrets.length === 0) {
    throw new Error('At least one secret is required')
  }

  const actorId = getGotrueUserId(claims)
  for (const secret of secrets) {
    const name = assertValidSecretName(secret.name)
    const value = typeof secret.value === 'string' ? secret.value : ''
    if (!value.trim()) throw new Error(`Secret value is required for ${name}`)

    const result = await executeQuery({
      query: `
        insert into saas.project_edge_function_secrets (project_ref, name, value_enc)
        values ($1, $2, $3)
        on conflict (project_ref, name) do update
          set value_enc = excluded.value_enc,
              updated_at = now()
      `,
      parameters: [ref, name, encryptString(value)],
      actorId,
    })
    if (result.error) throw result.error
  }

  await syncEdgeFunctionSecretsToDataPlane({ claims, ref }).catch((error) => {
    console.warn('[edge-function-secrets] data-plane sync failed:', error)
  })
}

export async function deleteEdgeFunctionSecrets({
  claims,
  ref,
  names,
}: {
  claims: Claims
  ref: string
  names: string[]
}) {
  await assertProjectAccess({ claims, ref })
  if (!Array.isArray(names) || names.length === 0) {
    throw new Error('At least one secret name is required')
  }

  const actorId = getGotrueUserId(claims)
  const cleaned = names.map((name) => assertValidSecretName(name))
  const result = await executeQuery({
    query: `
      delete from saas.project_edge_function_secrets
      where project_ref = $1
        and name = any($2::text[])
    `,
    parameters: [ref, cleaned],
    actorId,
  })
  if (result.error) throw result.error

  await syncEdgeFunctionSecretsToDataPlane({ claims, ref }).catch((error) => {
    console.warn('[edge-function-secrets] data-plane sync failed:', error)
  })
}

async function syncEdgeFunctionSecretsToDataPlane({
  claims,
  ref,
}: {
  claims: Claims
  ref: string
}) {
  if (!isDataPlaneProvisionerConfigured()) return
  await provisionTenantDataPlaneStack({
    claims,
    ref,
    apply: true,
    reason: 'edge_function_secrets',
  })
}
