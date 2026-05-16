import type { JwtPayload } from 'indobase-js'
import type { NextApiRequest } from 'next'

import { constructHeaders } from 'lib/api/apiHelpers'
import { IS_SAAS } from 'lib/constants'

import { resolveEncryptedPgMetaConnectionForProject } from './project-connection'

/** pg-meta proxy headers with tenant connection resolved server-side when the client omits it. */
export async function constructSaasPgMetaHeaders(
  req: NextApiRequest,
  claims?: JwtPayload
): Promise<Record<string, string>> {
  const base = constructHeaders(req.headers) as Record<string, string>
  if (!IS_SAAS || !claims) return base

  const ref = typeof req.query.ref === 'string' ? req.query.ref.trim() : ''
  if (!ref) return base

  if (base['x-connection-encrypted']?.trim()) return base

  try {
    const encrypted = await resolveEncryptedPgMetaConnectionForProject({
      claims,
      ref,
      incomingEncrypted: base['x-connection-encrypted'],
    })
    return { ...base, 'x-connection-encrypted': encrypted }
  } catch {
    return base
  }
}
