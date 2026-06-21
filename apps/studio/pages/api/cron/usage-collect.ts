import type { NextApiRequest, NextApiResponse } from 'next'

import { checkProjectQuotas } from 'lib/api/saas/quota-enforcement'
import { collectProjectKongUsage, hasKongUsageMetering } from 'lib/api/saas/usage-collectors/kong-usage'
import { collectProjectDatabaseBytes } from 'lib/api/saas/usage-collectors/postgres-usage'
import { collectProjectStorageBytes } from 'lib/api/saas/usage-collectors/storage-usage'
import { upsertUsageDailyMetric } from 'lib/api/saas/usage-daily-metrics'

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
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET'])
    return res.status(405).json({ message: `Method ${req.method} Not Allowed` })
  }

  if (!authorizeCron(req)) {
    return res.status(401).json({ message: 'Unauthorized' })
  }

  const projectRef =
    typeof req.query.project_ref === 'string' ? req.query.project_ref.trim() : ''
  if (!projectRef) {
    return res.status(400).json({ message: 'project_ref is required' })
  }

  try {
    const periodStart = new Date()
    periodStart.setUTCDate(1)
    periodStart.setUTCHours(0, 0, 0, 0)

    const [kong, databaseBytes, storageBytes, quotas] = await Promise.all([
      hasKongUsageMetering()
        ? collectProjectKongUsage({ projectRef, periodStart })
        : Promise.resolve({ egressBytes: 0, requestCount: 0, errorCount: 0 }),
      collectProjectDatabaseBytes(projectRef),
      collectProjectStorageBytes(projectRef),
      checkProjectQuotas(projectRef),
    ])

    const snapshotDay = new Date()
    if (databaseBytes != null) {
      await upsertUsageDailyMetric({
        projectRef,
        metric: 'DATABASE_SIZE',
        valueBytes: databaseBytes,
        day: snapshotDay,
      })
    }
    if (storageBytes != null) {
      await upsertUsageDailyMetric({
        projectRef,
        metric: 'STORAGE_SIZE',
        valueBytes: storageBytes,
        day: snapshotDay,
      })
    }

    return res.status(200).json({
      success: true,
      project_ref: projectRef,
      metrics: {
        egress_bytes: kong.egressBytes,
        request_count: kong.requestCount,
        error_count: kong.errorCount,
        database_bytes: databaseBytes,
        storage_bytes: storageBytes,
      },
      quotas,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return res.status(500).json({ message })
  }
}
