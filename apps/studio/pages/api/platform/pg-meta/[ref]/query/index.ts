import { constructHeaders } from 'lib/api/apiHelpers'
import apiWrapper from 'lib/api/apiWrapper'
import { resolveEncryptedPgMetaConnectionForProject } from 'lib/api/saas/project-connection'
import { executeQuery } from 'lib/api/saas/query'
import { ensureTenantGoTrueAuthSchema } from 'lib/api/saas/tenant-gotrue-schema'
import { PgMetaDatabaseError } from 'lib/api/saas/types'
import { IS_SAAS } from 'lib/constants'
import { JwtPayload } from 'indobase-js'
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

  // Do not expose every GoTrue user on the shared control-plane DB to arbitrary dashboard users.
  if (containsAuthUsersQuery(query) && !queryIncludesScopedUser(query, userId)) {
    if (!IS_SAAS) {
      return res.status(403).json({
        message: 'auth.users queries must be scoped to the current user',
      })
    }

    const ref = typeof req.query.ref === 'string' ? req.query.ref.trim() : ''
    const usesDedicatedTenantDb = await projectHasDedicatedTenantDatabase(ref, userId)

    if (!usesDedicatedTenantDb) {
      return res.status(403).json({
        message:
          'Listing auth.users requires a dedicated project database. This project is still on the shared database, or the connection is not provisioned yet.',
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
    return res.status(200).json(resultData)
  }
}

async function buildPgMetaHeaders(req: NextApiRequest, claims?: JwtPayload) {
  const headers = new Headers(constructHeaders(req.headers))
  if (!IS_SAAS || !claims) return headers

  const ref = typeof req.query.ref === 'string' ? req.query.ref.trim() : ''
  if (!ref) return headers

  try {
    const encrypted = await resolveEncryptedPgMetaConnectionForProject({
      claims,
      ref,
      incomingEncrypted: headers.get('x-connection-encrypted'),
    })
    headers.set('x-connection-encrypted', encrypted)
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    throw Object.assign(new Error(message), { statusCode: 400 })
  }
  return headers
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
