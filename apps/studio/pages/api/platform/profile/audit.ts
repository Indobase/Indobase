import type { JwtPayload } from '@supabase/supabase-js'
import type { NextApiRequest, NextApiResponse } from 'next'

import apiWrapper from 'lib/api/apiWrapper'
import { listProfileAuditLogs } from 'lib/api/self-hosted/audit'
import type { AuditLog } from 'data/organizations/organization-audit-logs-query'

export default (req: NextApiRequest, res: NextApiResponse) =>
  apiWrapper(req, res, handler, { withAuth: true })

async function handler(req: NextApiRequest, res: NextApiResponse, claims?: JwtPayload) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET'])
    return res
      .status(405)
      .json({ data: null, error: { message: `Method ${req.method} Not Allowed` } })
  }

  const startIso =
    typeof req.query.iso_timestamp_start === 'string' ? req.query.iso_timestamp_start : undefined
  const endIso =
    typeof req.query.iso_timestamp_end === 'string' ? req.query.iso_timestamp_end : undefined

  try {
    const rows = await listProfileAuditLogs({
      claims: claims as any,
      startIso,
      endIso,
    })

    const result: AuditLog[] = rows.map((row) => ({
      action: {
        name: row.action,
        metadata: [{ status: 200 }],
      },
      actor: {
        id: row.actor_gotrue_id ?? 'system',
        type: row.actor_gotrue_id ? 'user' : 'system',
        metadata: [
          {
            email: row.actor_email ?? undefined,
            ip: row.ip ?? undefined,
            tokenType: 'jwt',
          },
        ],
      },
      target: {
        description: row.target_description ?? row.target_type,
        metadata: {
          project_ref: row.project_ref,
          ref: row.project_ref,
          ...((row.metadata as Record<string, unknown> | null) ?? {}),
        },
      },
      occurred_at: row.occurred_at,
    }))

    return res.status(200).json({
      result,
      retention_period: 90,
    })
  } catch (err) {
    // Fail-safe: never break the Studio audit UI if the audit table isn't ready yet.
    // eslint-disable-next-line no-console
    console.warn('[audit] profile audit query failed:', err)
    return res.status(200).json({ result: [], retention_period: 0 })
  }
}
