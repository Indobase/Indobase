import type { JwtPayload } from '@indobaseinc/indobase-js'
import type { NextApiRequest, NextApiResponse } from 'next'

import apiWrapper from 'lib/api/apiWrapper'
import { executeQuery } from 'lib/api/saas/query'
import { recordAuditLog } from 'lib/api/saas/audit'

export default (req: NextApiRequest, res: NextApiResponse) =>
  apiWrapper(req, res, handler, { withAuth: true })

async function handler(req: NextApiRequest, res: NextApiResponse, claims?: JwtPayload) {
  const ref = typeof req.query.ref === 'string' ? req.query.ref : ''
  if (!ref) return res.status(400).json({ message: 'Project ref is required' })

  const normalized: any =
    claims && typeof (claims as any).claims === 'object' ? (claims as any).claims : claims
  const gotrueId: string | undefined = normalized?.sub
  if (!gotrueId) return res.status(401).json({ message: 'Missing user session' })

  switch (req.method) {
    case 'GET': {
      try {
        const row = await executeQuery<{ ssl_enforced: boolean }>({
          query: `
            select coalesce(p.ssl_enforced, false) as ssl_enforced
            from saas.projects p
            join saas.organization_members m on m.organization_id = p.organization_id
            where p.ref = $1 and m.gotrue_id = $2
            limit 1
          `,
          parameters: [ref, gotrueId],
          actorId: gotrueId,
        })
        if (row.error) return res.status(500).json({ message: row.error.message })
        if (!row.data?.length) return res.status(404).json({ message: 'Project not found' })
        return res.status(200).json({
          appliedSuccessfully: true,
          currentConfig: { database: Boolean(row.data[0].ssl_enforced) },
        })
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error'
        return res.status(500).json({ message })
      }
    }
    case 'PUT': {
      const body = parseBody(req.body)
      if (body === null) return res.status(400).json({ message: 'Invalid JSON body' })
      const enabled = Boolean(body?.requestedConfig?.database)

      try {
        const updated = await executeQuery<{ ssl_enforced: boolean }>({
          query: `
            update saas.projects p
            set ssl_enforced = $1
            where p.ref = $2
              and exists (
                select 1
                from saas.organization_members m
                where m.organization_id = p.organization_id
                  and m.gotrue_id = $3
                  and m.role in ('owner','admin')
              )
            returning coalesce(p.ssl_enforced, false) as ssl_enforced
          `,
          parameters: [enabled, ref, gotrueId],
          actorId: gotrueId,
        })
        if (updated.error) return res.status(500).json({ message: updated.error.message })
        if (!updated.data?.length) {
          return res.status(403).json({ message: 'Insufficient permissions' })
        }

        await recordAuditLog({
          claims,
          projectRef: ref,
          action: 'project.ssl_enforcement.updated',
          targetType: 'project',
          targetDescription: `SSL enforcement set to ${enabled}`,
          metadata: { enabled },
        })

        return res.status(200).json({
          appliedSuccessfully: true,
          currentConfig: { database: Boolean(updated.data[0].ssl_enforced) },
        })
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error'
        return res.status(500).json({ message })
      }
    }
    default: {
      res.setHeader('Allow', ['GET', 'PUT'])
      return res.status(405).json({ message: `Method ${req.method} Not Allowed` })
    }
  }
}

function parseBody(body: unknown) {
  if (typeof body !== 'string') return body ?? {}
  try {
    return JSON.parse(body as string)
  } catch {
    return null
  }
}
