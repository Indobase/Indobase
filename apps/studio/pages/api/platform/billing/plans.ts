import type { NextApiRequest, NextApiResponse } from 'next'

import apiWrapper from 'lib/api/apiWrapper'
import { getIndobasePublicPlans } from 'lib/api/saas/indobase-billing-plans'

export default (req: NextApiRequest, res: NextApiResponse) => apiWrapper(req, res, handler)

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { method } = req

  switch (method) {
    case 'GET':
      await getPlans(req, res)
      return
    default:
      res.setHeader('Allow', ['GET'])
      res.status(405).json({ error: { message: `Method ${method} Not Allowed` } })
      return
  }
}

async function getPlans(req: NextApiRequest, res: NextApiResponse) {
  try {
    const currency = typeof req.query.currency === 'string' ? req.query.currency : 'INR'
    const plans = getIndobasePublicPlans(currency)

    res.status(200).json({
      data: plans,
      currency,
      exchange_rate: currency === 'INR' ? 83 : 1,
    })
  } catch (error) {
    console.error('Error fetching plans:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    res.status(500).json({ error: { message } })
  }
}
