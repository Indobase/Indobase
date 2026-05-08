import type { JwtPayload } from '@supabase/supabase-js'
import { executeQuery } from './query'
import { recordAuditLog } from './audit'

type Claims = JwtPayload & Record<string, any>

function getActor(claims: Claims | undefined) {
  if (!claims) throw new Error('Missing claims')
  const normalized: any =
    claims && typeof (claims as any).claims === 'object' ? (claims as any).claims : claims
  const id =
    (normalized?.sub as string | undefined) ??
    (normalized?.id as string | undefined) ??
    (normalized?.user_id as string | undefined)
  if (!id) throw new Error('Missing gotrue user id')
  return { id }
}

async function assertProjectMembership(
  projectRef: string,
  gotrueId: string,
  requiredRoles: Array<'owner' | 'admin' | 'developer' | 'viewer'> = [
    'owner',
    'admin',
    'developer',
    'viewer',
  ]
) {
  const row = await executeQuery<{ id: number }>({
    query: `
      select p.id
      from saas.projects p
      join saas.organization_members m on m.organization_id = p.organization_id
      where p.ref = $1 and m.gotrue_id = $2 and m.role = any($3::text[])
      limit 1
    `,
    parameters: [projectRef, gotrueId, requiredRoles as unknown as string[]],
    actorId: gotrueId,
  })
  if (row.error) throw row.error
  if (!row.data?.length) throw new Error('Project not found or insufficient permissions')
  return row.data[0].id
}

export type ThirdPartyAuthRow = {
  id: string
  type: string
  oidc_issuer_url: string | null
  jwks_url: string | null
  custom_jwks: any
  resolved_jwks: any
  inserted_at: string
  updated_at: string
}

const mapRow = (row: ThirdPartyAuthRow) => ({
  id: row.id,
  type: row.type,
  oidc_issuer_url: row.oidc_issuer_url ?? undefined,
  jwks_url: row.jwks_url ?? undefined,
  custom_jwks: row.custom_jwks ?? undefined,
  resolved_jwks: row.resolved_jwks ?? undefined,
  resolved_at: null,
  inserted_at: row.inserted_at,
  updated_at: row.updated_at,
})

export async function listThirdPartyAuthIntegrations({
  claims,
  ref,
}: {
  claims: Claims
  ref: string
}) {
  const { id: gotrueId } = getActor(claims)
  await assertProjectMembership(ref, gotrueId)

  const rows = await executeQuery<ThirdPartyAuthRow>({
    query: `
      select
        id::text as id,
        type,
        oidc_issuer_url,
        jwks_url,
        custom_jwks,
        resolved_jwks,
        inserted_at,
        updated_at
      from saas.third_party_auth_integrations
      where project_ref = $1
      order by inserted_at desc
    `,
    parameters: [ref],
    actorId: gotrueId,
  })
  if (rows.error) throw rows.error
  return (rows.data ?? []).map(mapRow)
}

export async function createThirdPartyAuthIntegration({
  claims,
  ref,
  body,
}: {
  claims: Claims
  ref: string
  body: {
    oidc_issuer_url?: string
    jwks_url?: string
    custom_jwks?: unknown
  }
}) {
  const { id: gotrueId } = getActor(claims)
  await assertProjectMembership(ref, gotrueId, ['owner', 'admin'])

  const oidc = (body.oidc_issuer_url || '').trim() || null
  const jwks = (body.jwks_url || '').trim() || null
  const customJwks = body.custom_jwks ?? null

  if (!oidc && !jwks && !customJwks) {
    throw new Error('Provide one of oidc_issuer_url, jwks_url, or custom_jwks')
  }

  const type = oidc ? 'oidc' : jwks ? 'jwks' : 'custom_jwks'

  const inserted = await executeQuery<ThirdPartyAuthRow>({
    query: `
      insert into saas.third_party_auth_integrations (
        project_ref, type, oidc_issuer_url, jwks_url, custom_jwks
      )
      values ($1, $2, $3, $4, $5::jsonb)
      returning
        id::text as id,
        type,
        oidc_issuer_url,
        jwks_url,
        custom_jwks,
        resolved_jwks,
        inserted_at,
        updated_at
    `,
    parameters: [
      ref,
      type,
      oidc,
      jwks,
      customJwks ? JSON.stringify(customJwks) : null,
    ],
    actorId: gotrueId,
  })
  if (inserted.error || !inserted.data?.length) {
    throw inserted.error ?? new Error('Failed to create integration')
  }

  const row = inserted.data[0]
  await recordAuditLog({
    claims,
    projectRef: ref,
    action: 'project.third_party_auth.added',
    targetType: 'third_party_auth',
    targetDescription: `${type} (${oidc || jwks || 'custom_jwks'})`,
    metadata: { id: row.id, type },
  })
  return mapRow(row)
}

export async function deleteThirdPartyAuthIntegration({
  claims,
  ref,
  tpaId,
}: {
  claims: Claims
  ref: string
  tpaId: string
}) {
  const { id: gotrueId } = getActor(claims)
  await assertProjectMembership(ref, gotrueId, ['owner', 'admin'])

  const removed = await executeQuery<{ id: string; type: string }>({
    query: `
      delete from saas.third_party_auth_integrations
      where id::text = $1 and project_ref = $2
      returning id::text as id, type
    `,
    parameters: [tpaId, ref],
    actorId: gotrueId,
  })
  if (removed.error) throw removed.error

  if (removed.data?.length) {
    await recordAuditLog({
      claims,
      projectRef: ref,
      action: 'project.third_party_auth.removed',
      targetType: 'third_party_auth',
      targetDescription: tpaId,
      metadata: { id: tpaId, type: removed.data[0].type },
    })
  }

  return Boolean(removed.data?.length)
}
