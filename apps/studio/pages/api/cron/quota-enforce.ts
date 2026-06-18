import type { NextApiRequest, NextApiResponse } from 'next'

import {
  enforceAllProjectQuotas,
  enforceProjectQuotas,
} from 'lib/api/saas/quota-enforcement'

function authorizeCron(req: NextApiRequest): boolean {
  const expected =
    process.env.INDOBASE_CRON_SECRET?.trim() ||
    process.env.DATA_PLANE_PROVISIONER_TOKEN?.trim() ||
    ''
  if (!expected) return false
  const auth = req.headers.authorization?.trim() ?? ''
  if (auth === `Bearer ${expected}`) return true
  const header = req.headers['x-indobase-cron-secret']
  return typeof header === 'string' && header === expected
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST'])
    return res.status(405).json({ message: `Method ${req.method} Not Allowed` })
  }

  if (!authorizeCron(req)) {
    return res.status(401).json({ message: 'Unauthorized' })
  }

  const projectRef =
    typeof req.query.project_ref === 'string' ? req.query.project_ref.trim() : ''

  try {
    if (projectRef) {
      const result = await enforceProjectQuotas(projectRef)
      return res.status(200).json({ success: true, project_ref: projectRef, ...result })
    }

    const result = await enforceAllProjectQuotas()
    return res.status(200).json({ success: true, ...result })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return res.status(500).json({ message })
  }
}
