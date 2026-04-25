import { constructHeaders } from 'lib/api/apiHelpers'
import apiWrapper from 'lib/api/apiWrapper'
import { executeQuery } from 'lib/api/self-hosted/query'
import { PgMetaDatabaseError } from 'lib/api/self-hosted/types'
import { IS_PLATFORM, IS_SAAS } from 'lib/constants'
import { JwtPayload } from '@supabase/supabase-js'
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

  // Self-hosted Studio should not expose every auth user to every dashboard user.
  // Enforce that auth.users listing queries include a current-user filter.
  if (!IS_SAAS) {
    const userId = getGotrueUserId(claims)
    if (containsAuthUsersQuery(query) && !queryIncludesScopedUser(query, userId)) {
      return res.status(403).json({
        message: 'auth.users queries must be scoped to the current user in self-hosted mode',
      })
    }

    // Automatically enforce Row Level Security for data-related queries in multi-tenant self-hosted setups
    // Strip frontend's role impersonation wrapper if present to prevent it from overriding the server's enforcement
    let innerQuery = query
    const marker = 'select 1 as "ROLE_IMPERSONATION_NO_RESULTS";'
    if (innerQuery.includes(marker)) {
      innerQuery = innerQuery.split(marker).pop() || innerQuery
    }

    const isDataQuery = /^\s*(select|insert|update|delete|with|explain)\b/i.test(innerQuery.trim())
    if (isDataQuery) {
      const ref = typeof req.query.ref === 'string' ? req.query.ref : 'default'
      const role = { 
        type: 'postgrest' as const, 
        role: 'authenticated' as const, 
        userType: 'external' as const, 
        externalAuth: { sub: userId } 
      }
      const impersonationClaims = getPostgrestClaims(ref, role)
      query = wrapWithRoleImpersonation(innerQuery, { role, claims: impersonationClaims })
    } else {
      query = innerQuery // If it's a DDL query, we still want to strip the frontend wrapper so it runs as the default pg-meta role (superuser)
    }
  }

  const headers = constructHeaders(req.headers)
  const { data, error } = await executeQuery({ query, headers })

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
      !IS_SAAS && 
      Array.isArray(resultData) && 
      resultData.length > 0 && 
      resultData[0]?.ROLE_IMPERSONATION_NO_RESULTS === 1
    ) {
      resultData = []
    }
    return res.status(200).json(resultData)
  }
}

function containsAuthUsersQuery(query: string) {
  return /\bfrom\s+auth\.users\b/i.test(query)
}

function queryIncludesScopedUser(query: string, userId: string) {
  // Accept either `id = '<uuid>'` or `auth.users.id = '<uuid>'`.
  const escaped = userId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`\\b(?:auth\\.users\\.)?id\\s*=\\s*'${escaped}'`, 'i').test(query)
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
