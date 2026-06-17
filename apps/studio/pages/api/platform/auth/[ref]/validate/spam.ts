import type { JwtPayload } from '@indobaseinc/indobase-js'
import type { NextApiRequest, NextApiResponse } from 'next'

import apiWrapper from 'lib/api/apiWrapper'
import { setNoStore } from 'lib/api/no-store'
import { validateEmailSpam } from 'lib/api/saas/validate-email-spam'
import { executeQuery } from 'lib/api/saas/query'
import { ensureSaasTables, getGotrueUserId } from 'lib/api/saas/platform'

export default (req: NextApiRequest, res: NextApiResponse) =>
  apiWrapper(req, res, handler, { withAuth: true })

async function handler(req: NextApiRequest, res: NextApiResponse, claims?: JwtPayload) {
  setNoStore(res)
  const { method } = req

  switch (method) {
    case 'POST':
      return handlePost(req, res, claims)
    default:
      res.setHeader('Allow', ['POST'])
      res.status(405).json({ message: `Method ${method} Not Allowed` })
  }
}

async function assertProjectMember(ref: string, claims: JwtPayload) {
  await ensureSaasTables()
  const gotrueId = getGotrueUserId(claims)
  const row = await executeQuery<{ ok: number }>({
    query: `
      select 1 as ok
      from saas.projects p
      join saas.organization_members m on m.organization_id = p.organization_id
      where p.ref = $1 and m.gotrue_id = $2
      limit 1
    `,
    parameters: [ref, gotrueId],
    actorId: gotrueId,
  })
  if (row.error) throw row.error
  return Boolean(row.data?.length)
}

const handlePost = async (
  req: NextApiRequest,
  res: NextApiResponse,
  claims?: JwtPayload
) => {
  const ref = typeof req.query.ref === 'string' ? req.query.ref.trim() : ''
  if (!ref) return res.status(400).json({ message: 'Project ref is required' })
  if (!claims) return res.status(401).json({ message: 'Unauthorized' })

  const body = req.body && typeof req.body === 'object' ? req.body : {}
  const subject = typeof body.subject === 'string' ? body.subject : ''
  const content = typeof body.content === 'string' ? body.content : ''

  try {
    const allowed = await assertProjectMember(ref, claims)
    if (!allowed) return res.status(404).json({ message: 'Project not found' })

    const result = await validateEmailSpam({ subject, content })
    return res.status(200).json(result)
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Failed to validate spam based on the given email content'
    return res.status(500).json({ message })
  }
}
