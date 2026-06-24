import fs from 'node:fs'
import type { NextApiRequest, NextApiResponse } from 'next'

function resolveBuildSha(): string {
  for (const path of ['/app/BUILD_SHA', '/srv/studio/BUILD_SHA']) {
    try {
      const value = fs.readFileSync(path, 'utf8').trim()
      if (value) return value
    } catch {
      // ignore missing file
    }
  }
  return process.env.BUILD_SHA || 'unknown'
}

/**
 * Liveness probe for deploy smoke tests and load balancers.
 * Does not call postgres-meta or upstream services — always returns JSON 200.
 */
export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', ['GET', 'HEAD'])
    return res.status(405).end()
  }

  res.setHeader('Cache-Control', 'no-store')

  if (req.method === 'HEAD') {
    return res.status(200).end()
  }

  return res.status(200).json({
    status: 'ok',
    service: 'studio',
    timestamp: new Date().toISOString(),
    version: resolveBuildSha(),
  })
}
