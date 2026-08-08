import type { NextApiRequest, NextApiResponse } from 'next'

import apiWrapper from 'lib/api/apiWrapper'
import { requireOsApiSecret } from 'lib/api/saas/os-api-auth'
import { assertOsAccountForEnsure } from 'lib/api/saas/os-ensurer-access'
import {
  applyAppSchema,
  type SchemaTableInput,
} from 'lib/api/saas/apply-schema'
import type { Claims } from 'lib/api/saas/platform'

function claimsFromBody(payload: Record<string, unknown>): Claims | null {
  const sub =
    typeof payload.gotrue_id === 'string'
      ? payload.gotrue_id
      : typeof payload.gotrueId === 'string'
        ? payload.gotrueId
        : ''
  const email = typeof payload.email === 'string' ? payload.email : ''
  if (!sub) return null
  return { sub, email, role: 'authenticated' } as Claims
}

/** OS / agent: apply declarative tables for any web app data model. */
export default (req: NextApiRequest, res: NextApiResponse) => apiWrapper(req, res, handler)

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST'])
    return res.status(405).json({ message: `Method ${req.method} Not Allowed` })
  }
  if (!requireOsApiSecret(req)) {
    return res.status(401).json({ message: 'Unauthorized OS API request' })
  }

  let payload: Record<string, unknown> = req.body ?? {}
  if (typeof payload === 'string') {
    try {
      payload = JSON.parse(payload) as Record<string, unknown>
    } catch {
      payload = {}
    }
  }

  const workspaceRef =
    typeof payload.workspace_ref === 'string'
      ? payload.workspace_ref.trim()
      : typeof payload.workspaceRef === 'string'
        ? payload.workspaceRef.trim()
        : ''
  if (!workspaceRef) return res.status(400).json({ message: 'workspace_ref required' })

  const claims = claimsFromBody(payload)
  if (!claims) return res.status(400).json({ message: 'gotrue_id required' })

  const early = assertOsAccountForEnsure({ gotrueId: claims.sub, workspaceRef })
  if (!early.ok) {
    return res.status(403).json({ ok: false, code: early.code, message: early.message })
  }

  const brand = typeof payload.brand === 'string' ? payload.brand : null
  const tablesRaw = Array.isArray(payload.tables) ? payload.tables : []
  const tables: SchemaTableInput[] = tablesRaw
    .filter((t): t is Record<string, unknown> => !!t && typeof t === 'object')
    .map((t) => ({
      name: typeof t.name === 'string' ? t.name : '',
      anon_select: typeof t.anon_select === 'boolean' ? t.anon_select : null,
      authenticated_write:
        typeof t.authenticated_write === 'boolean' ? t.authenticated_write : null,
      columns: Array.isArray(t.columns)
        ? t.columns
            .filter((c): c is Record<string, unknown> => !!c && typeof c === 'object')
            .map((c) => ({
              name: typeof c.name === 'string' ? c.name : '',
              type: typeof c.type === 'string' ? c.type : '',
              primary_key: typeof c.primary_key === 'boolean' ? c.primary_key : null,
              required: typeof c.required === 'boolean' ? c.required : null,
              unique: typeof c.unique === 'boolean' ? c.unique : null,
              default: typeof c.default === 'string' ? c.default : null,
            }))
        : [],
    }))

  try {
    const result = await applyAppSchema({ claims, ref: workspaceRef, tables, brand })
    const status = result.ok
      ? 200
      : result.code === 'database_required'
        ? 403
        : result.code === 'tables_required' ||
            result.code === 'invalid_schema' ||
            result.code === 'too_many_tables'
          ? 400
          : 502
    return res.status(status).json(result)
  } catch (error) {
    return res.status(502).json({
      ok: false,
      message: error instanceof Error ? error.message : 'applySchema failed',
    })
  }
}
