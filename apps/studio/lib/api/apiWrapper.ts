import type { JwtPayload } from '@indobaseinc/indobase-js'
import type { NextApiRequest, NextApiResponse } from 'next'
import { ResponseError, ResponseFailure } from 'types'

import { PgMetaDatabaseError } from './saas/types'
import {
  isSecretDecryptionError,
  secretDecryptionClientMessage,
} from './saas/secret-decryption-error'
import { apiAuthenticate } from './apiAuthenticate'

export function isResponseOk<T>(response: T | ResponseFailure | undefined): response is T {
  if (response === undefined || response === null) {
    return false
  }

  if (response instanceof ResponseError) {
    return false
  }

  if (typeof response === 'object' && 'error' in response && Boolean(response.error)) {
    return false
  }

  return true
}

// Purpose of this apiWrapper is to function like a global catchall for ANY errors
// It's a safety net as the API service should never drop, nor fail

export default async function apiWrapper(
  req: NextApiRequest,
  res: NextApiResponse,
  handler: (
    req: NextApiRequest,
    res: NextApiResponse,
    claims?: JwtPayload
  ) => Promise<Response | void>,
  options?: { withAuth: boolean }
): Promise<Response | void> {
  try {
    const { withAuth } = options || {}
    let claims: JwtPayload | undefined

    if (withAuth) {
      const response = await apiAuthenticate(req, res)
      if (!isResponseOk(response)) {
        const unauthorizedMessage = `Unauthorized: ${response.error.message}`
        return res.status(401).json({
          message: unauthorizedMessage,
          error: {
            message: unauthorizedMessage,
          },
        })
      }
      claims = response
    }

    return await handler(req, res, claims)
  } catch (error) {
    if (isSecretDecryptionError(error)) {
      return res.status(500).json({
        message: secretDecryptionClientMessage(error.correlationId),
        correlationId: error.correlationId,
        error: {
          message: secretDecryptionClientMessage(error.correlationId),
          correlationId: error.correlationId,
        },
      })
    }

    if (error instanceof PgMetaDatabaseError) {
      const cryptoHint = /unauthorized/i.test(error.message)
        ? 'Studio encryption settings must match the postgres-meta service. Restart both after fixing server configuration.'
        : 'Check postgres-meta connectivity and database credentials — see docker/ENV-FOR-OWN-BACKEND.md'
      return res.status(502).json({
        message: `SaaS database error: ${error.message}`,
        hint: cryptoHint,
        error: {
          name: error.name,
          message: error.message,
          code: error.code,
        },
      })
    }

    const rawMessage =
      error instanceof Error
        ? error.message
        : typeof error === 'string'
          ? error
          : 'Internal server error'

    const message = /CRYPTO_KEY|PG_META_CRYPTO_KEY/i.test(rawMessage)
      ? 'Unable to read encrypted project data. Contact support if this persists.'
      : rawMessage

    const missingPgMeta =
      message.includes('STUDIO_PG_META_URL is not set') ||
      message.includes('Missing gotrue user id in JWT claims') ||
      message.includes('Cannot reach postgres-meta')

    return res.status(missingPgMeta ? 503 : 500).json({
      message,
      hint: message.includes('Cannot reach postgres-meta')
        ? 'Studio must reach postgres-meta on the Docker network (STUDIO_PG_META_URL=http://indobase-meta:8080). See docker/DOKPLOY-STUDIO-ENV.md'
        : undefined,
      error:
        error instanceof Error
          ? { name: error.name, message }
          : { message: String(error) },
    })
  }
}
