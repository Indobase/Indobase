import type { NextApiRequest, NextApiResponse } from 'next'

import { setNoStore } from 'lib/api/no-store'
import { pauseIdleProjects } from 'lib/api/saas/plan-lifecycle'

/**
 * Cron: sleep apps idle past their plan's threshold (Free 7 days, Basic/Pro 30, Studio+ never).
 * Owner-pinned projects are skipped on plans that grant pinning.
 * Protect with CRON_SECRET (Authorization: Bearer …) when set.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  setNoStore(res)
  if (req.method !== 'POST' && req.method !== 'GET') {
    res.setHeader('Allow', ['GET', 'POST'])
    return res.status(405).json({ message: 'Method not allowed' })
  }

  const secret = process.env.CRON_SECRET?.trim()
  if (secret) {
    const auth = req.headers.authorization?.trim()
    if (auth !== `Bearer ${secret}`) {
      return res.status(401).json({ message: 'Unauthorized' })
    }
  }

  const dryRun = req.query.dry_run === '1' || req.query.dry_run === 'true'
  const limitRaw = typeof req.query.limit === 'string' ? parseInt(req.query.limit, 10) : 50
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 200) : 50

  try {
    const result = await pauseIdleProjects({ dryRun, limit })
    return res.status(200).json({ ok: true, dry_run: dryRun, ...result })
  } catch (error) {
    console.error('[cron/idle-sleep]', error)
    return res.status(500).json({
      ok: false,
      message: error instanceof Error ? error.message : 'Idle sleep failed',
    })
  }
}
