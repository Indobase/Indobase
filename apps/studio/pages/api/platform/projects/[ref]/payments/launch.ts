import { NextApiRequest, NextApiResponse } from 'next'

import type { JwtPayload } from '@indobaseinc/indobase-js'

import apiWrapper from 'lib/api/apiWrapper'
import { getPaymentsLaunchRedirect } from 'lib/api/saas/payments-launch'

const paymentsLaunchHandler = (req: NextApiRequest, res: NextApiResponse) =>
  apiWrapper(req, res, handler, { withAuth: true })

export default paymentsLaunchHandler

async function handler(req: NextApiRequest, res: NextApiResponse, claims?: JwtPayload) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET'])
    return res.status(405).json({ message: `Method ${req.method} Not Allowed` })
  }

  const { ref } = req.query
  if (typeof ref !== 'string' || !ref.trim()) {
    return res.status(400).json({ message: 'Project ref is required' })
  }

  if (!claims) {
    return res.status(401).json({ message: 'Unauthorized' })
  }

  try {
    const response = await getPaymentsLaunchRedirect({
      claims,
      ref: ref.trim(),
    })

    return res.status(200).json({
      token: response.token,
      url: response.url,
      project_ref: response.project.ref,
      organization_slug: response.project.organization_slug,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to launch Payments'
    const status = message.toLowerCase().includes('secret') ? 503 : 500
    return res.status(status).json({ message })
  }
}
