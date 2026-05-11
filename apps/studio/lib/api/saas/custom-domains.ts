import type { JwtPayload } from 'indobase-js'
import { mkdir, writeFile, unlink } from 'node:fs/promises'
import path from 'node:path'

import { executeQuery } from './query'
import { recordAuditLog } from './audit'

type Claims = JwtPayload & Record<string, any>

const KONG_ROUTER_NAME = 'indobase-tenant-kong-service'
const VERIFICATION_TXT_NAME_PREFIX = '_indobase-domain-verify'
const VERIFICATION_TOKEN_LENGTH = 32

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

async function assertProjectMembership(projectRef: string, gotrueId: string) {
  const row = await executeQuery<{ id: number }>({
    query: `
      select p.id
      from saas.projects p
      join saas.organization_members m on m.organization_id = p.organization_id
      where p.ref = $1 and m.gotrue_id = $2
      limit 1
    `,
    parameters: [projectRef, gotrueId],
    actorId: gotrueId,
  })
  if (row.error) throw row.error
  if (!row.data?.length) throw new Error('Project not found or insufficient permissions')
  return row.data[0].id
}

function randomToken(length: number) {
  const bytes = new Uint8Array(length)
  crypto.getRandomValues(bytes)
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, length)
}

function isValidHostname(hostname: string): boolean {
  if (!hostname || hostname.length > 253) return false
  // Basic FQDN check; not full RFC 1123 but good enough to reject obvious garbage.
  return /^(?!-)[A-Za-z0-9-]{1,63}(\.(?!-)[A-Za-z0-9-]{1,63})+(?<!-)$/.test(hostname)
}

export type CustomDomainRow = {
  id: string
  project_ref: string
  hostname: string
  status: string
  ownership_verification: any
  ssl: any
  created_at: string
  updated_at: string
}

function mapRowToApiResponse(row: CustomDomainRow) {
  const ownership = Array.isArray(row.ownership_verification)
    ? (row.ownership_verification as Array<{ name: string; type: string; value: string }>)
    : []
  const ownershipPrimary = ownership[0]
  const ssl = (row.ssl as any) ?? {}

  // Map our internal status -> the Studio-facing 5-step status.
  const status = (() => {
    switch (row.status) {
      case 'pending_verification':
        return '2_initiated'
      case 'verified':
        return '3_challenge_verified'
      case 'origin_setup_completed':
        return '4_origin_setup_completed'
      case 'active':
        return '5_services_reconfigured'
      default:
        return '1_not_started'
    }
  })()

  return {
    custom_hostname: row.hostname,
    data: {
      errors: [] as unknown[],
      messages: [] as unknown[],
      success: true,
      result: {
        custom_origin_server: process.env.SUPABASE_PUBLIC_URL ?? '',
        hostname: row.hostname,
        id: row.id,
        ownership_verification: ownershipPrimary ?? { name: '', type: 'TXT', value: '' },
        ssl: {
          status: ssl.status ?? (row.status === 'active' ? 'active' : 'pending_validation'),
          validation_errors: ssl.validation_errors ?? [],
          validation_records: ssl.validation_records ?? ownership,
        },
        status: row.status,
        verification_errors: ssl.validation_errors?.map((e: any) => e.message) ?? [],
      },
    },
    status,
  } as const
}

/** Returns the current custom domain row for a project (membership-gated). */
export async function getCustomDomain({ claims, ref }: { claims: Claims; ref: string }) {
  const { id: gotrueId } = getActor(claims)
  await assertProjectMembership(ref, gotrueId)

  const rows = await executeQuery<CustomDomainRow>({
    query: `
      select
        id::text as id,
        project_ref,
        hostname,
        status,
        ownership_verification,
        ssl,
        created_at,
        updated_at
      from saas.custom_domains
      where project_ref = $1
      order by created_at desc
      limit 1
    `,
    parameters: [ref],
    actorId: gotrueId,
  })
  if (rows.error) throw rows.error
  const row = rows.data?.[0]
  if (!row) return null
  return mapRowToApiResponse(row)
}

/** Initializes a custom domain: stores it as pending_verification and emits a TXT challenge. */
export async function initializeCustomDomain({
  claims,
  ref,
  hostname,
}: {
  claims: Claims
  ref: string
  hostname: string
}) {
  const { id: gotrueId } = getActor(claims)
  await assertProjectMembership(ref, gotrueId)

  const cleanHost = (hostname || '').trim().toLowerCase()
  if (!isValidHostname(cleanHost)) throw new Error('Invalid hostname')

  // Replace any prior config for this project.
  const removed = await executeQuery<{ hostname: string }>({
    query: `delete from saas.custom_domains where project_ref = $1 returning hostname`,
    parameters: [ref],
    actorId: gotrueId,
  })
  if (removed.error) throw removed.error

  const token = randomToken(VERIFICATION_TOKEN_LENGTH)
  const verificationTxt = {
    name: `${VERIFICATION_TXT_NAME_PREFIX}.${cleanHost}`,
    type: 'TXT',
    value: `indobase-domain-verify=${token}`,
  }

  const inserted = await executeQuery<CustomDomainRow>({
    query: `
      insert into saas.custom_domains (
        project_ref,
        hostname,
        status,
        ownership_verification,
        ssl
      ) values ($1, $2, 'pending_verification', $3::jsonb, $4::jsonb)
      returning
        id::text as id,
        project_ref,
        hostname,
        status,
        ownership_verification,
        ssl,
        created_at,
        updated_at
    `,
    parameters: [
      ref,
      cleanHost,
      JSON.stringify([verificationTxt]),
      JSON.stringify({
        status: 'pending_validation',
        validation_records: [
          { txt_name: verificationTxt.name, txt_value: verificationTxt.value },
        ],
      }),
    ],
    actorId: gotrueId,
  })
  if (inserted.error || !inserted.data?.length) {
    throw inserted.error ?? new Error('Failed to insert custom domain')
  }

  await recordAuditLog({
    claims,
    projectRef: ref,
    action: 'project.custom_domain.added',
    targetType: 'custom_domain',
    targetDescription: cleanHost,
    metadata: { hostname: cleanHost },
  })

  return mapRowToApiResponse(inserted.data[0])
}

/**
 * Re-verifies the TXT record. In a single-DB SaaS deployment we don't have
 * Cloudflare; instead we resolve the TXT record via Node DNS and compare the value.
 */
export async function reverifyCustomDomain({
  claims,
  ref,
}: {
  claims: Claims
  ref: string
}) {
  const { id: gotrueId } = getActor(claims)
  await assertProjectMembership(ref, gotrueId)

  const rows = await executeQuery<CustomDomainRow>({
    query: `
      select
        id::text as id,
        project_ref,
        hostname,
        status,
        ownership_verification,
        ssl,
        created_at,
        updated_at
      from saas.custom_domains
      where project_ref = $1
      order by created_at desc
      limit 1
    `,
    parameters: [ref],
    actorId: gotrueId,
  })
  if (rows.error) throw rows.error
  if (!rows.data?.length) throw new Error('No custom domain configured')

  const row = rows.data[0]
  const ownership = Array.isArray(row.ownership_verification)
    ? (row.ownership_verification as Array<{ name: string; type: string; value: string }>)
    : []
  const challenge = ownership[0]
  if (!challenge) throw new Error('Missing ownership verification record')

  let resolved: string[] = []
  try {
    // Lazy import to avoid bundling node:dns into client-side code paths.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const dns = await import('node:dns/promises')
    const records = (await dns.resolveTxt(challenge.name)) as string[][]
    resolved = records.map((parts) => parts.join(''))
  } catch (err) {
    // DNS errors -> still pending; surface message.
    const message = err instanceof Error ? err.message : 'DNS resolution failed'
    const ssl = {
      status: 'pending_validation',
      validation_errors: [{ message }],
      validation_records: [{ txt_name: challenge.name, txt_value: challenge.value }],
    }
    const updated = await executeQuery<CustomDomainRow>({
      query: `
        update saas.custom_domains
        set ssl = $1::jsonb, updated_at = now()
        where project_ref = $2
        returning id::text as id, project_ref, hostname, status, ownership_verification, ssl, created_at, updated_at
      `,
      parameters: [JSON.stringify(ssl), ref],
      actorId: gotrueId,
    })
    if (updated.error || !updated.data?.length) throw updated.error ?? new Error('Failed to update domain')
    return mapRowToApiResponse(updated.data[0])
  }

  const verified = resolved.some((value) => value === challenge.value)
  const newStatus = verified ? 'verified' : 'pending_verification'
  const ssl = {
    status: verified ? 'active' : 'pending_validation',
    validation_errors: verified ? [] : [{ message: 'TXT record not yet visible' }],
    validation_records: [{ txt_name: challenge.name, txt_value: challenge.value }],
  }

  const updated = await executeQuery<CustomDomainRow>({
    query: `
      update saas.custom_domains
      set status = $1, ssl = $2::jsonb, updated_at = now()
      where project_ref = $3
      returning id::text as id, project_ref, hostname, status, ownership_verification, ssl, created_at, updated_at
    `,
    parameters: [newStatus, JSON.stringify(ssl), ref],
    actorId: gotrueId,
  })
  if (updated.error || !updated.data?.length) throw updated.error ?? new Error('Failed to update domain')
  return mapRowToApiResponse(updated.data[0])
}

/**
 * Activates the custom domain: writes a Traefik dynamic config file (if configured)
 * that maps the hostname to the shared Kong gateway with the required project_ref
 * header, then marks the domain as active.
 */
export async function activateCustomDomain({
  claims,
  ref,
}: {
  claims: Claims
  ref: string
}) {
  const { id: gotrueId } = getActor(claims)
  await assertProjectMembership(ref, gotrueId)

  const rows = await executeQuery<CustomDomainRow>({
    query: `
      select
        id::text as id,
        project_ref,
        hostname,
        status,
        ownership_verification,
        ssl,
        created_at,
        updated_at
      from saas.custom_domains
      where project_ref = $1
      order by created_at desc
      limit 1
    `,
    parameters: [ref],
    actorId: gotrueId,
  })
  if (rows.error) throw rows.error
  if (!rows.data?.length) throw new Error('No custom domain configured')
  const row = rows.data[0]
  if (row.status !== 'verified') throw new Error('Domain must be verified before activation')

  await writeTraefikDynamicConfig({ projectRef: ref, hostname: row.hostname })

  const updated = await executeQuery<CustomDomainRow>({
    query: `
      update saas.custom_domains
      set status = 'active',
          ssl = jsonb_set(coalesce(ssl, '{}'::jsonb), '{status}', '"active"'),
          updated_at = now()
      where project_ref = $1
      returning id::text as id, project_ref, hostname, status, ownership_verification, ssl, created_at, updated_at
    `,
    parameters: [ref],
    actorId: gotrueId,
  })
  if (updated.error || !updated.data?.length) throw updated.error ?? new Error('Failed to activate')

  await recordAuditLog({
    claims,
    projectRef: ref,
    action: 'project.custom_domain.activated',
    targetType: 'custom_domain',
    targetDescription: row.hostname,
    metadata: { hostname: row.hostname },
  })

  return mapRowToApiResponse(updated.data[0])
}

export async function deleteCustomDomain({
  claims,
  ref,
}: {
  claims: Claims
  ref: string
}) {
  const { id: gotrueId } = getActor(claims)
  await assertProjectMembership(ref, gotrueId)

  const removed = await executeQuery<{ hostname: string }>({
    query: `delete from saas.custom_domains where project_ref = $1 returning hostname`,
    parameters: [ref],
    actorId: gotrueId,
  })
  if (removed.error) throw removed.error

  const hostname = removed.data?.[0]?.hostname
  if (hostname) await removeTraefikDynamicConfig({ projectRef: ref })

  await recordAuditLog({
    claims,
    projectRef: ref,
    action: 'project.custom_domain.removed',
    targetType: 'custom_domain',
    targetDescription: hostname ?? ref,
    metadata: { hostname },
  })

  return Boolean(hostname)
}

/**
 * Best-effort writer for Traefik dynamic config.
 *
 * If `CUSTOM_DOMAIN_TRAEFIK_DIR` is set, writes a YAML routing rule into that
 * directory so Traefik picks up the new hostname. Otherwise, just updates the
 * DB row and the operator can pull the config out of saas.custom_domains.
 */
async function writeTraefikDynamicConfig({
  projectRef,
  hostname,
}: {
  projectRef: string
  hostname: string
}) {
  const dir = process.env.CUSTOM_DOMAIN_TRAEFIK_DIR
  if (!dir) return

  await mkdir(dir, { recursive: true })

  const filename = `indobase-tenant-${sanitizeForFilename(projectRef)}.yml`
  const targetPath = path.join(dir, filename)

  const yaml = `# Auto-generated by Indobase Studio. Do not edit by hand.
# Project: ${projectRef}
# Hostname: ${hostname}
http:
  routers:
    indobase-tenant-${sanitizeForFilename(projectRef)}-router:
      rule: Host(\`${hostname}\`)
      service: ${KONG_ROUTER_NAME}
      entryPoints:
        - web
        - websecure
      middlewares:
        - indobase-tenant-${sanitizeForFilename(projectRef)}-headers
      tls:
        certResolver: letsencrypt

  services:
    ${KONG_ROUTER_NAME}:
      loadBalancer:
        servers:
          - url: http://indobase-kong:8000
        passHostHeader: true

  middlewares:
    indobase-tenant-${sanitizeForFilename(projectRef)}-headers:
      headers:
        customRequestHeaders:
          x-project-ref: ${projectRef}
`

  await writeFile(targetPath, yaml, 'utf8')
}

async function removeTraefikDynamicConfig({ projectRef }: { projectRef: string }) {
  const dir = process.env.CUSTOM_DOMAIN_TRAEFIK_DIR
  if (!dir) return
  const filename = `indobase-tenant-${sanitizeForFilename(projectRef)}.yml`
  const targetPath = path.join(dir, filename)
  try {
    await unlink(targetPath)
  } catch {
    // file may not exist; ignore
  }
}

function sanitizeForFilename(input: string) {
  return input.replace(/[^a-zA-Z0-9_-]/g, '_')
}
