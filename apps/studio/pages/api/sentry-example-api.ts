import * as Sentry from '@sentry/nextjs'
import type { NextApiRequest, NextApiResponse } from 'next'

/**
 * Dev-only Sentry verification endpoint. Disabled in production.
 */
export default async function handler(_req: NextApiRequest, res: NextApiResponse) {
  if (process.env.NODE_ENV === 'production' && process.env.SENTRY_ALLOW_EXAMPLE !== 'true') {
    return res.status(404).json({ message: 'Not found' })
  }

  const marker = `Sentry test error ${new Date().toISOString()}`

  Sentry.captureException(new Error(marker), {
    tags: { sentry_setup_verification: 'true' },
    extra: { source: 'sentry-example-api' },
  })

  await Sentry.flush(2000)

  res.status(500).json({
    ok: false,
    message: 'Test error sent to Sentry (if DSN is configured)',
    marker,
  })
}
