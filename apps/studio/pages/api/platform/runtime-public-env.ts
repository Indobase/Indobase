import type { NextApiRequest, NextApiResponse } from 'next'

import {
  resolvePublicGotrueUrlForBrowser,
  resolveServerPublicAnonKey,
} from 'common/public-env'

/**
 * Runtime public auth config for browser clients. Uses server env (SUPABASE_ANON_KEY)
 * instead of build-time NEXT_PUBLIC_* values that may still carry the demo anon JWT.
 */
export default function handler(_req: NextApiRequest, res: NextApiResponse) {
  const anonKey = resolveServerPublicAnonKey()
  const gotrueUrl = resolvePublicGotrueUrlForBrowser()

  res.setHeader('Cache-Control', 'no-store')
  return res.status(200).json({
    ...(anonKey ? { anonKey } : {}),
    ...(gotrueUrl ? { gotrueUrl } : {}),
  })
}
