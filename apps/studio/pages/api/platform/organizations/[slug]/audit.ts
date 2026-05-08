import type { JwtPayload } from '@supabase/supabase-js'
import type { NextApiRequest, NextApiResponse } from 'next'

import apiWrapper from 'lib/api/apiWrapper'
import { listOrganizationAuditLogs } from 'lib/api/self-hosted/audit'
import { executeQuery } from 'lib/api/self-hosted/query'

export default (req: NextApiRequest, res: NextApiResponse) =>
  apiWrapper(req, res, handler, { withAuth: true })

async function handler(req: NextApiRequest, res: NextApiResponse, claims?: JwtPayload) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET'])
    return res.status(405).json({ message: `Method ${req.method} Not Allowed` })
  }

  const slug = typeof req.query.slug === 'string' ? req.query.slug : ''
  if (!slug) return res.status(400).json({ message: 'slug is required' })

  const startIso =
    typeof req.query.iso_timestamp_start === 'string' ? req.query.iso_timestamp_start : undefined
  const endIso =
    typeof req.query.iso_timestamp_end === 'string' ? req.query.iso_timestamp_end : undefined

  // Resolve org id from slug, gated on membership.
  const normalizedClaims: any =
    claims && typeof (claims as any).claims === 'object' ? (claims as any).claims : claims
  const gotrueId: string | undefined = normalizedClaims?.sub
  if (!gotrueId) return res.status(401).json({ message: 'Missing user session' })

  const lookup = await executeQuery<{ id: number }>({
    query: `
      select o.id
      from saas.organizations o
      join saas.organization_members m on m.organization_id = o.id
      where o.slug = $1 and m.gotrue_id = $2
      limit 1
    `,
    parameters: [slug, gotrueId],
    actorId: gotrueId,
  })
  if (lookup.error) return res.status(500).json({ message: lookup.error.message })
  if (!lookup.data?.length) return res.status(404).json({ message: 'Organization not found' })

  const organizationId = lookup.data[0].id

  try {
    const rows = await listOrganizationAuditLogs({
      claims: claims as any,
      organizationId,
      startIso,
      endIso,
    })

    const result = rows.map((row) => ({
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
          org_slug: slug,
          project_ref: row.project_ref,
          ref: row.project_ref,
          slug,
          ...(row.metadata as Record<string, unknown> | null),
        },
      },
      occurred_at: row.occurred_at,
    }))

    return res.status(200).json({
      result,
      retention_period: 90,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return res.status(500).json({ message })
  }
}
