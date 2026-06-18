import { generateKeyPairSync, randomUUID } from 'node:crypto'

import type { JwtPayload } from '@indobaseinc/indobase-js'

import { recordAuditLog } from './audit'
import { resolveProjectJwtSecret } from './project-jwt'
import { executeQuery } from './query'
import {
  isDataPlaneProvisionerConfigured,
  repairTenantDataPlaneStack,
} from './tenant-data-plane-provision'
import { encryptString, decryptString } from './util'

type Claims = JwtPayload & Record<string, unknown>

export type SigningKeyStatus = 'in_use' | 'previously_used' | 'revoked' | 'standby'
export type SigningKeyAlgorithm = 'EdDSA' | 'ES256' | 'RS256' | 'HS256'

type SigningKeyRow = {
  id: string
  project_id: number
  algorithm: SigningKeyAlgorithm
  status: SigningKeyStatus
  public_jwk: Record<string, unknown> | null
  private_jwk_enc: string | null
  is_legacy: boolean
  created_at: string
  updated_at: string
}

const WRITE_ROLES = ['owner', 'admin'] as const
const READ_ROLES = ['owner', 'admin', 'developer', 'viewer'] as const

function getActor(claims: Claims | undefined) {
  if (!claims) throw new Error('Missing claims')
  const normalized: Record<string, unknown> =
    claims && typeof (claims as { claims?: unknown }).claims === 'object'
      ? ((claims as { claims: Record<string, unknown> }).claims as Record<string, unknown>)
      : (claims as Record<string, unknown>)
  const id =
    (normalized.sub as string | undefined) ??
    (normalized.id as string | undefined) ??
    (normalized.user_id as string | undefined)
  if (!id) throw new Error('Missing gotrue user id')
  return { id }
}

async function ensureSigningKeysSchema() {
  await executeQuery({
    query: `
      create table if not exists saas.project_jwt_signing_keys (
        id uuid primary key default gen_random_uuid(),
        project_id integer not null references saas.projects(id) on delete cascade,
        algorithm text not null check (algorithm in ('EdDSA', 'ES256', 'RS256', 'HS256')),
        status text not null check (status in ('in_use', 'previously_used', 'revoked', 'standby')),
        public_jwk jsonb null,
        private_jwk_enc text null,
        is_legacy boolean not null default false,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      );
      create unique index if not exists project_jwt_signing_keys_one_in_use_idx
        on saas.project_jwt_signing_keys (project_id)
        where status = 'in_use';
    `,
    parameters: [],
  })
}

async function assertProjectAccess(
  projectRef: string,
  gotrueId: string,
  roles: readonly string[] = READ_ROLES
) {
  const row = await executeQuery<{ id: number; organization_id: number }>({
    query: `
      select p.id, p.organization_id
      from saas.projects p
      join saas.organization_members m on m.organization_id = p.organization_id
      where p.ref = $1 and m.gotrue_id = $2 and m.role = any($3::text[])
      limit 1
    `,
    parameters: [projectRef, gotrueId, roles as unknown as string[]],
    actorId: gotrueId,
  })
  if (row.error) throw row.error
  if (!row.data?.[0]) throw new Error('Project not found or insufficient permissions')
  return row.data[0]
}

function mapSigningKey(row: SigningKeyRow) {
  return {
    id: row.id,
    algorithm: row.algorithm,
    status: row.status,
    public_jwk: row.public_jwk ?? undefined,
    created_at: new Date(row.created_at).toISOString(),
    updated_at: new Date(row.updated_at).toISOString(),
  }
}

function publicFromPrivate(privateJwk: Record<string, unknown>): Record<string, unknown> {
  const pub = { ...privateJwk }
  delete pub.d
  delete pub.p
  delete pub.q
  delete pub.dp
  delete pub.dq
  delete pub.qi
  delete pub.k
  pub.key_ops = ['verify']
  return pub
}

function generateEs256KeyPair() {
  const kid = randomUUID()
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' })
  const privateJwk = privateKey.export({ format: 'jwk' }) as Record<string, unknown>
  const publicJwk = publicKey.export({ format: 'jwk' }) as Record<string, unknown>
  privateJwk.kid = kid
  privateJwk.alg = 'ES256'
  publicJwk.kid = kid
  publicJwk.alg = 'ES256'
  return { privateJwk, publicJwk }
}

function hs256PrivateJwk(secret: string, kid: string) {
  return {
    kty: 'oct',
    alg: 'HS256',
    k: Buffer.from(secret, 'utf8').toString('base64'),
    kid,
    key_ops: ['sign', 'verify'],
  }
}

async function reprovisionTenantAuth(projectRef: string) {
  if (!isDataPlaneProvisionerConfigured()) return
  await repairTenantDataPlaneStack({ ref: projectRef, reason: 'jwt_signing_keys' })
}

export async function listProjectSigningKeys({ claims, ref }: { claims: Claims; ref: string }) {
  await ensureSigningKeysSchema()
  const { id: gotrueId } = getActor(claims)
  await assertProjectAccess(ref, gotrueId)

  const rows = await executeQuery<SigningKeyRow>({
    query: `
      select k.*
      from saas.project_jwt_signing_keys k
      join saas.projects p on p.id = k.project_id
      where p.ref = $1
      order by k.created_at desc
    `,
    parameters: [ref],
    actorId: gotrueId,
  })
  if (rows.error) throw rows.error
  return { keys: (rows.data ?? []).map(mapSigningKey) }
}

export async function getProjectSigningKey({
  claims,
  ref,
  keyId,
}: {
  claims: Claims
  ref: string
  keyId: string
}) {
  await ensureSigningKeysSchema()
  const { id: gotrueId } = getActor(claims)
  await assertProjectAccess(ref, gotrueId)

  const row = await executeQuery<SigningKeyRow>({
    query: `
      select k.*
      from saas.project_jwt_signing_keys k
      join saas.projects p on p.id = k.project_id
      where p.ref = $1 and k.id = $2::uuid
      limit 1
    `,
    parameters: [ref, keyId],
    actorId: gotrueId,
  })
  if (row.error) throw row.error
  const key = row.data?.[0]
  if (!key) throw new Error('Signing key not found')
  return mapSigningKey(key)
}

export async function createProjectSigningKey({
  claims,
  ref,
  body,
}: {
  claims: Claims
  ref: string
  body: {
    algorithm: SigningKeyAlgorithm
    status?: SigningKeyStatus
    private_jwk?: Record<string, unknown>
  }
}) {
  await ensureSigningKeysSchema()
  const { id: gotrueId } = getActor(claims)
  const project = await assertProjectAccess(ref, gotrueId, WRITE_ROLES)

  const status = body.status ?? 'standby'
  if (status !== 'standby' && status !== 'in_use') {
    throw new Error('New signing keys must be created as standby or in_use')
  }

  let privateJwk: Record<string, unknown>
  let publicJwk: Record<string, unknown>
  const id = randomUUID()

  if (body.private_jwk) {
    privateJwk = { ...body.private_jwk, kid: id, alg: body.algorithm }
    publicJwk = publicFromPrivate(privateJwk)
  } else if (body.algorithm === 'ES256') {
    const generated = generateEs256KeyPair()
    privateJwk = { ...generated.privateJwk, kid: id }
    publicJwk = { ...generated.publicJwk, kid: id }
  } else {
    throw new Error('private_jwk is required for this algorithm')
  }

  if (status === 'in_use') {
    await executeQuery({
      query: `
        update saas.project_jwt_signing_keys
        set status = 'previously_used', updated_at = now()
        where project_id = $1 and status = 'in_use'
      `,
      parameters: [project.id],
      actorId: gotrueId,
    })
  }

  const insert = await executeQuery<SigningKeyRow>({
    query: `
      insert into saas.project_jwt_signing_keys (
        id, project_id, algorithm, status, public_jwk, private_jwk_enc
      ) values ($1::uuid, $2, $3, $4, $5::jsonb, $6)
      returning *
    `,
    parameters: [
      id,
      project.id,
      body.algorithm,
      status,
      JSON.stringify(publicJwk),
      encryptString(JSON.stringify(privateJwk)),
    ],
    actorId: gotrueId,
  })
  if (insert.error) throw insert.error
  const created = insert.data?.[0]
  if (!created) throw new Error('Failed to create signing key')

  await recordAuditLog({
    organizationId: project.organization_id,
    projectRef: ref,
    action: 'auth.signing_key.create',
    targetType: 'signing_key',
    targetDescription: `Created JWT signing key ${id}`,
    metadata: { algorithm: body.algorithm, status },
  })

  if (status === 'in_use') {
    await reprovisionTenantAuth(ref)
  }

  return mapSigningKey(created)
}

export async function updateProjectSigningKey({
  claims,
  ref,
  keyId,
  body,
}: {
  claims: Claims
  ref: string
  keyId: string
  body: { status: SigningKeyStatus }
}) {
  await ensureSigningKeysSchema()
  const { id: gotrueId } = getActor(claims)
  const project = await assertProjectAccess(ref, gotrueId, WRITE_ROLES)

  const existing = await executeQuery<SigningKeyRow>({
    query: `
      select k.*
      from saas.project_jwt_signing_keys k
      where k.project_id = $1 and k.id = $2::uuid
      limit 1
    `,
    parameters: [project.id, keyId],
    actorId: gotrueId,
  })
  if (existing.error) throw existing.error
  const key = existing.data?.[0]
  if (!key) throw new Error('Signing key not found')

  if (body.status === 'in_use' && key.status === 'standby') {
    await executeQuery({
      query: `
        update saas.project_jwt_signing_keys
        set status = 'previously_used', updated_at = now()
        where project_id = $1 and status = 'in_use'
      `,
      parameters: [project.id],
      actorId: gotrueId,
    })
  }

  const updated = await executeQuery<SigningKeyRow>({
    query: `
      update saas.project_jwt_signing_keys
      set status = $3, updated_at = now()
      where project_id = $1 and id = $2::uuid
      returning *
    `,
    parameters: [project.id, keyId, body.status],
    actorId: gotrueId,
  })
  if (updated.error) throw updated.error
  const row = updated.data?.[0]
  if (!row) throw new Error('Failed to update signing key')

  await recordAuditLog({
    organizationId: project.organization_id,
    projectRef: ref,
    action: 'auth.signing_key.update',
    targetType: 'signing_key',
    targetDescription: `Updated JWT signing key ${keyId} to ${body.status}`,
    metadata: { status: body.status },
  })

  if (body.status === 'in_use') {
    await reprovisionTenantAuth(ref)
  }

  return mapSigningKey(row)
}

export async function deleteProjectSigningKey({
  claims,
  ref,
  keyId,
}: {
  claims: Claims
  ref: string
  keyId: string
}) {
  await ensureSigningKeysSchema()
  const { id: gotrueId } = getActor(claims)
  const project = await assertProjectAccess(ref, gotrueId, WRITE_ROLES)

  const existing = await executeQuery<SigningKeyRow>({
    query: `
      select k.*
      from saas.project_jwt_signing_keys k
      where k.project_id = $1 and k.id = $2::uuid
      limit 1
    `,
    parameters: [project.id, keyId],
    actorId: gotrueId,
  })
  if (existing.error) throw existing.error
  const key = existing.data?.[0]
  if (!key) throw new Error('Signing key not found')
  if (key.status !== 'revoked') {
    throw new Error('Only revoked keys can be permanently deleted')
  }

  await executeQuery({
    query: `delete from saas.project_jwt_signing_keys where project_id = $1 and id = $2::uuid`,
    parameters: [project.id, keyId],
    actorId: gotrueId,
  })

  await recordAuditLog({
    organizationId: project.organization_id,
    projectRef: ref,
    action: 'auth.signing_key.delete',
    targetType: 'signing_key',
    targetDescription: `Deleted JWT signing key ${keyId}`,
    metadata: {},
  })
}

export async function getLegacyProjectSigningKey({ claims, ref }: { claims: Claims; ref: string }) {
  await ensureSigningKeysSchema()
  const { id: gotrueId } = getActor(claims)
  await assertProjectAccess(ref, gotrueId)

  const row = await executeQuery<SigningKeyRow>({
    query: `
      select k.*
      from saas.project_jwt_signing_keys k
      join saas.projects p on p.id = k.project_id
      where p.ref = $1 and k.is_legacy = true
      limit 1
    `,
    parameters: [ref],
    actorId: gotrueId,
  })
  if (row.error) throw row.error
  const key = row.data?.[0]
  if (!key) throw new Error('Legacy signing key not found')
  return mapSigningKey(key)
}

export async function migrateLegacyProjectSigningKey({
  claims,
  ref,
}: {
  claims: Claims
  ref: string
}) {
  await ensureSigningKeysSchema()
  const { id: gotrueId } = getActor(claims)
  const project = await assertProjectAccess(ref, gotrueId, WRITE_ROLES)

  const existing = await executeQuery<{ count: string }>({
    query: `
      select count(*)::text as count
      from saas.project_jwt_signing_keys
      where project_id = $1 and is_legacy = true
    `,
    parameters: [project.id],
    actorId: gotrueId,
  })
  if (existing.error) throw existing.error
  if (parseInt(existing.data?.[0]?.count ?? '0', 10) > 0) {
    throw new Error('Legacy signing key migration already completed')
  }

  const secretRow = await executeQuery<{ jwt_secret_enc: string | null }>({
    query: `select jwt_secret_enc from saas.projects where id = $1 limit 1`,
    parameters: [project.id],
    actorId: gotrueId,
  })
  if (secretRow.error) throw secretRow.error
  const jwtSecret = resolveProjectJwtSecret(secretRow.data?.[0]?.jwt_secret_enc)

  const legacyId = randomUUID()
  const legacyPrivate = hs256PrivateJwk(jwtSecret, legacyId)
  const legacyPublic = publicFromPrivate(legacyPrivate)

  const standby = generateEs256KeyPair()
  const standbyId = randomUUID()
  const standbyPrivate = { ...standby.privateJwk, kid: standbyId }
  const standbyPublic = { ...standby.publicJwk, kid: standbyId }

  const legacyInsert = await executeQuery<SigningKeyRow>({
    query: `
      insert into saas.project_jwt_signing_keys (
        id, project_id, algorithm, status, public_jwk, private_jwk_enc, is_legacy
      ) values ($1::uuid, $2, 'HS256', 'in_use', $3::jsonb, $4, true)
      returning *
    `,
    parameters: [
      legacyId,
      project.id,
      JSON.stringify(legacyPublic),
      encryptString(JSON.stringify(legacyPrivate)),
    ],
    actorId: gotrueId,
  })
  if (legacyInsert.error) throw legacyInsert.error

  await executeQuery({
    query: `
      insert into saas.project_jwt_signing_keys (
        id, project_id, algorithm, status, public_jwk, private_jwk_enc
      ) values ($1::uuid, $2, 'ES256', 'standby', $3::jsonb, $4)
    `,
    parameters: [
      standbyId,
      project.id,
      JSON.stringify(standbyPublic),
      encryptString(JSON.stringify(standbyPrivate)),
    ],
    actorId: gotrueId,
  })

  await recordAuditLog({
    organizationId: project.organization_id,
    projectRef: ref,
    action: 'auth.signing_key.migrate_legacy',
    targetType: 'signing_key',
    targetDescription: 'Migrated legacy JWT secret to signing keys',
    metadata: { legacy_key_id: legacyId, standby_key_id: standbyId },
  })

  await reprovisionTenantAuth(ref)

  const created = legacyInsert.data?.[0]
  if (!created) throw new Error('Failed to migrate legacy signing key')
  return mapSigningKey(created)
}
