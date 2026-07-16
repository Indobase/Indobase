import { constructHeaders } from 'lib/api/apiHelpers'
import apiWrapper from 'lib/api/apiWrapper'
import { constructSaasPgMetaHeaders } from 'lib/api/saas/pg-meta-headers'
import { provisionDedicatedTenantDatabaseForProject } from 'lib/api/saas/platform'
import { executeQuery } from 'lib/api/saas/query'
import { getBlockedSaasCatalogQueryReason } from 'lib/api/saas/pg-meta-sql-guard'
import { ensureTenantGoTrueAuthSchema } from 'lib/api/saas/tenant-gotrue-schema'
import {
  refreshTenantPublicApiExposure,
  sqlLooksLikePublicDdl,
} from 'lib/api/saas/tenant-postgrest'
import { PgMetaDatabaseError } from 'lib/api/saas/types'
import { IS_SAAS } from 'lib/constants'
import { JwtPayload } from '@indobaseinc/indobase-js'
import { NextApiRequest, NextApiResponse } from 'next'
import { getPostgrestClaims, wrapWithRoleImpersonation } from 'lib/role-impersonation'

export default (req: NextApiRequest, res: NextApiResponse) =>
  apiWrapper(req, res, handler, { withAuth: true })

async function handler(req: NextApiRequest, res: NextApiResponse, claims?: JwtPayload) {
  const { method } = req

  switch (method) {
    case 'POST':
      return handlePost(req, res, claims)
    default:
      res.setHeader('Allow', ['POST'])
      res.status(405).json({ error: { message: `Method ${method} Not Allowed` } })
  }
}

const handlePost = async (req: NextApiRequest, res: NextApiResponse, claims?: JwtPayload) => {
  let { query } = req.body
  if (typeof query !== 'string' || !query.trim()) {
    return res.status(400).json({ message: 'SQL query is required' })
  }

  const userId = getGotrueUserId(claims)
  const ref = typeof req.query.ref === 'string' ? req.query.ref : ''

  if (IS_SAAS && ref) {
    const { assertBackendStudioAccessForProject, backendStudioBlockedPayload } = await import(
      'lib/api/saas/backend-studio-gate'
    )
    const gate = await assertBackendStudioAccessForProject(ref)
    if (!gate.ok) {
      return res.status(402).json(backendStudioBlockedPayload(gate))
    }
  }

  if (IS_SAAS) {
    const blockedReason = getBlockedSaasCatalogQueryReason(query)
    if (blockedReason) {
      return res.status(403).json({ message: blockedReason })
    }
  }

  // Do not expose every GoTrue user on the shared control-plane DB to arbitrary dashboard users.
  if (containsAuthUsersQuery(query) && !queryIncludesScopedUser(query, userId)) {
    if (!IS_SAAS) {
      return res.status(403).json({
        message: 'auth.users queries must be scoped to the current user',
      })
    }

    const ref = typeof req.query.ref === 'string' ? req.query.ref.trim() : ''
    let usesDedicatedTenantDb = await projectHasDedicatedTenantDatabase(ref, userId)

    if (
      !usesDedicatedTenantDb &&
      process.env.SAAS_AUTO_PROVISION_DEDICATED_ON_AUTH_USERS !== 'false' &&
      claims &&
      ref
    ) {
      try {
        await provisionDedicatedTenantDatabaseForProject({ claims, ref })
        usesDedicatedTenantDb = await projectHasDedicatedTenantDatabase(ref, userId)
      } catch (provisionErr) {
        console.warn(
          '[pg-meta/query] auto dedicated DB provision failed for %s: %O',
          ref,
          provisionErr
        )
      }
    }

    if (!usesDedicatedTenantDb) {
      return res.status(403).json({
        message:
          'Listing auth.users requires a dedicated project database. This project is still on the shared database, or the connection is not provisioned yet. Provision via POST /api/platform/projects/{ref}/provision-dedicated-database or set SAAS_AUTO_PROVISION_DEDICATED_ON_AUTH_USERS=true.',
      })
    }
  }

  if (!IS_SAAS) {
    // Automatically enforce Row Level Security for data-related queries in multi-tenant setups.
    // Strip frontend's role impersonation wrapper if present to prevent it from overriding the server's enforcement
    let innerQuery = query
    const marker = 'select 1 as "ROLE_IMPERSONATION_NO_RESULTS";'
    if (innerQuery.includes(marker)) {
      innerQuery = innerQuery.split(marker).pop() || innerQuery
    }

    const isDataQuery = /^\s*(select|insert|update|delete|with|explain)\b/i.test(innerQuery.trim())
    if (isDataQuery) {
      const rawRef = typeof req.query.ref === 'string' ? req.query.ref.trim() : ''
      const ref = rawRef && rawRef !== 'default' ? rawRef : ''
      if (!ref) {
        query = innerQuery
      } else {
        const role = {
          type: 'postgrest' as const,
          role: 'authenticated' as const,
          userType: 'external' as const,
          externalAuth: { sub: userId }
        }
        const impersonationClaims = getPostgrestClaims(ref, role)
        query = wrapWithRoleImpersonation(innerQuery, { role, claims: impersonationClaims })
      }
    } else {
      query = innerQuery // If it's a DDL query, we still want to strip the frontend wrapper so it runs as the default pg-meta role (superuser)
    }
  }

  let headers: HeadersInit
  try {
    headers = await buildPgMetaHeaders(req, claims)
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e)
    return res.status(400).json({ message, formattedError: message })
  }
  let { data, error } = await executeQuery({ query, headers })

  const ref = typeof req.query.ref === 'string' ? req.query.ref.trim() : ''
  if (
    error &&
    IS_SAAS &&
    containsAuthUsersQuery(query) &&
    claims &&
    isAuthUsersMissingError(error)
  ) {
    try {
      await ensureTenantGoTrueAuthSchema({ claims, ref })
      const retry = await executeQuery({ query, headers })
      data = retry.data
      error = retry.error
    } catch (repairErr) {
      console.warn('[pg-meta/query] auth schema repair failed for %s: %O', ref, repairErr)
    }
  }

  if (error) {
    if (error instanceof PgMetaDatabaseError) {
      const { statusCode, message, formattedError } = error
      return res.status(statusCode).json({ message, formattedError })
    }
    const { message } = error
    return res.status(500).json({ message, formattedError: message })
  } else {
    let resultData = data
    if (
      Array.isArray(resultData) &&
      resultData.length > 0 &&
      (resultData[0] as any)?.ROLE_IMPERSONATION_NO_RESULTS === 1
    ) {
      resultData = []
    }
    if (IS_SAAS && ref && sqlLooksLikePublicDdl(query)) {
      void maybeRefreshTenantPostgrestAfterDdl(ref).catch((e) => {
        console.warn('[pg-meta/query] post-DDL PostgREST refresh failed for %s: %O', ref, e)
      })
    }
    return res.status(200).json(resultData)
  }
}

async function maybeRefreshTenantPostgrestAfterDdl(ref: string) {
  const adminPassword = process.env.POSTGRES_PASSWORD?.trim()
  if (!adminPassword) return
  const dbName = `tenantdb_${ref.replace(/-/g, '_')}`
  await refreshTenantPublicApiExposure({
    host: process.env.POSTGRES_HOST || '127.0.0.1',
    port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
    dbName,
    adminPassword,
  })
}

async function buildPgMetaHeaders(req: NextApiRequest, claims?: JwtPayload) {
  const record = await constructSaasPgMetaHeaders(req, claims)
  if (IS_SAAS && claims && !record['x-connection-encrypted']?.trim()) {
    throw new Error('No database connection is configured for this project.')
  }
  return new Headers(record)
}

function containsAuthUsersQuery(query: string) {
  return /\bfrom\s+auth\.users\b/i.test(query)
}

function queryIncludesScopedUser(query: string, userId: string) {
  // Accept either `id = '<uuid>'` or `auth.users.id = '<uuid>'`.
  const escaped = userId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`\\b(?:auth\\.users\\.)?id\\s*=\\s*'${escaped}'`, 'i').test(query)
}

async function projectHasDedicatedTenantDatabase(ref: string, gotrueId: string): Promise<boolean> {
  if (!ref) return false
  const row = await executeQuery<{
    connection_string_enc: string | null
    connection_string: string | null
  }>({
    query: `
      select p.connection_string_enc, p.connection_string
      from saas.projects p
      join saas.organization_members m on m.organization_id = p.organization_id
      where p.ref = $1 and m.gotrue_id = $2
      limit 1
    `,
    parameters: [ref, gotrueId],
    actorId: gotrueId,
  })
  if (row.error) throw row.error
  const p = row.data?.[0]
  return Boolean(p?.connection_string_enc?.trim() || p?.connection_string?.trim())
}

function isAuthUsersMissingError(error: unknown): boolean {
  const parts: string[] = []
  if (error instanceof PgMetaDatabaseError) {
    parts.push(error.message, error.formattedError)
  } else if (error instanceof Error) {
    parts.push(error.message)
  } else if (typeof error === 'object' && error && 'message' in error) {
    parts.push(String((error as { message?: unknown }).message))
  } else {
    parts.push(String(error))
  }
  return parts.some((m) => /relation\s+"auth\.users"\s+does not exist/i.test(m))
}

function getGotrueUserId(claims?: JwtPayload): string {
  const normalized: any =
    claims && typeof (claims as any).claims === 'object' ? (claims as any).claims : claims
  const id =
    normalized?.sub ??
    normalized?.id ??
    normalized?.uid ??
    normalized?.user_metadata?.sub ??
    normalized?.user_metadata?.id ??
    normalized?.user_metadata?.user_id ??
    normalized?.user_id ??
    normalized?.gotrue_id ??
    normalized?.user?.id ??
    normalized?.app_metadata?.sub
  if (typeof id !== 'string' || !id) {
    throw new Error('Missing gotrue user id in JWT claims')
  }
  return id
}
