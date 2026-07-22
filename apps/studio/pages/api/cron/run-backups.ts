import type { NextApiRequest, NextApiResponse } from 'next'

import { setNoStore } from 'lib/api/no-store'
import { listBackupEligibleProjects, pruneExpiredBackups, runTenantBackup } from 'lib/api/saas/tenant-backups'

/**
 * Cron: take a logical backup of every backup-eligible tenant (plan.backupRetentionDays > 0), then
 * prune dumps past their retention window. Run daily.
 *
 * Protect with CRON_SECRET (Authorization: Bearer …) when set.
 *   POST /api/cron/run-backups            → back up all eligible tenants, then prune
 *   POST /api/cron/run-backups?prune=only → prune expired only (no new dumps)
 *   POST /api/cron/run-backups?ref=<ref>  → back up a single project (manual/on-demand)
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

  const pruneOnly = req.query.prune === 'only'
  const singleRef = typeof req.query.ref === 'string' ? req.query.ref.trim() : ''
  const limitRaw = typeof req.query.limit === 'string' ? parseInt(req.query.limit, 10) : 200
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 1000) : 200

  try {
    let attempted = 0
    let succeeded = 0
    let failed = 0

    if (!pruneOnly) {
      const eligible = await listBackupEligibleProjects(limit)
      const targets = singleRef ? eligible.filter((p) => p.ref === singleRef) : eligible

      if (singleRef && targets.length === 0) {
        return res.status(404).json({
          ok: false,
          message: `Project ${singleRef} is not backup-eligible (no dedicated DB, or plan has no backups).`,
        })
      }

      // Sequential on purpose: pg_dump is I/O heavy and the provisioner runs it on the shared
      // cluster. Parallel dumps would contend for the same disk and connections.
      for (const target of targets) {
        attempted += 1
        const result = await runTenantBackup({
          ref: target.ref,
          dbName: target.dbName,
          retentionDays: target.retentionDays,
        })
        if (result.ok) succeeded += 1
        else failed += 1
      }
    }

    const prune = await pruneExpiredBackups()

    return res.status(200).json({
      ok: true,
      mode: pruneOnly ? 'prune_only' : singleRef ? 'single' : 'fleet',
      attempted,
      succeeded,
      failed,
      pruned: prune.pruned,
      prune_failed: prune.failed,
    })
  } catch (error) {
    console.error('[cron/run-backups]', error)
    return res.status(500).json({
      ok: false,
      message: error instanceof Error ? error.message : 'Backup run failed',
    })
  }
}
