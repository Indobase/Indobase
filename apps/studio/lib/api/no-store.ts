import type { NextApiResponse } from 'next'

/**
 * Prevent shared/proxy caches from storing sensitive API responses.
 */
export function setNoStore(res: NextApiResponse) {
  res.setHeader('Cache-Control', 'no-store')
}
