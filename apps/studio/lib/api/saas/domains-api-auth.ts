import type { JwtPayload } from '@indobaseinc/indobase-js'
import type { NextApiRequest } from 'next'

import { fetchUserClaims } from 'lib/api/apiAuthenticate'

import { verifyDomainsProductToken } from './domains-product-token'

/** Accept Studio session JWT or Domains product API bearer token. */
export async function resolveDomainsApiClaims(
  req: NextApiRequest
): Promise<JwtPayload | null> {
  const token = req.headers.authorization?.replace(/^bearer\s+/i, '')
  if (!token) return null

  const product = verifyDomainsProductToken(token)
  if (product) {
    return {
      sub: product.sub,
      email: product.email,
      role: product.role,
      project_ref: product.project_ref,
    } as JwtPayload
  }

  try {
    return await fetchUserClaims(req)
  } catch {
    return null
  }
}
