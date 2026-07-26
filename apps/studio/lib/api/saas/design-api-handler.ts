import type { NextApiRequest, NextApiResponse } from 'next'

import type { JwtPayload } from '@indobaseinc/indobase-js'

import apiWrapper from 'lib/api/apiWrapper'
import { setNoStore } from 'lib/api/no-store'
import {
  designApiClaimsToJwtPayload,
  readBearerToken,
  verifyDesignApiToken,
  type DesignApiTokenPayload,
} from 'lib/api/saas/design-api-auth'

export type DesignApiCaller = {
  claims: JwtPayload & Record<string, unknown>
  auth: 'studio' | 'design-api'
  designToken?: DesignApiTokenPayload
}

/**
 * Dual auth for Design platform APIs:
 * - Studio cookie session (apiWrapper)
 * - Bearer Design API token (minted by indobase-design-v2 with DESIGN_HANDOFF_SECRET)
 */
export async function withDesignApiAuth(
  req: NextApiRequest,
  res: NextApiResponse,
  handler: (req: NextApiRequest, res: NextApiResponse, caller: DesignApiCaller) => Promise<unknown>
) {
  setNoStore(res)

  if (req.method === 'OPTIONS') {
    return res.status(204).end()
  }

  const bearer = readBearerToken(req.headers.authorization)
  if (bearer) {
    try {
      const designToken = verifyDesignApiToken(bearer)
      const claims = designApiClaimsToJwtPayload(designToken) as JwtPayload & Record<string, unknown>
      return await handler(req, res, { claims, auth: 'design-api', designToken })
    } catch (error) {
      return res.status(401).json({
        message: error instanceof Error ? error.message : 'Invalid Design API token',
      })
    }
  }

  return apiWrapper(
    req,
    res,
    async (innerReq, innerRes, claims?: JwtPayload) => {
      if (!claims) {
        return innerRes.status(401).json({ message: 'Unauthorized' })
      }
      return handler(innerReq, innerRes, {
        claims: claims as JwtPayload & Record<string, unknown>,
        auth: 'studio',
      })
    },
    { withAuth: true }
  )
}

export function statusFromError(error: unknown): number {
  if (error && typeof error === 'object' && 'status' in error) {
    const status = Number((error as { status?: number }).status)
    if (Number.isFinite(status) && status >= 400 && status < 600) return status
  }
  const message = error instanceof Error ? error.message.toLowerCase() : ''
  if (message.includes('not found')) return 404
  if (message.includes('forbidden') || message.includes('grant you')) return 403
  if (message.includes('required') || message.includes('invalid')) return 400
  return 500
}

export function assertCallerMatchesRef(caller: DesignApiCaller, ref: string) {
  if (caller.auth === 'design-api' && caller.designToken) {
    if (caller.designToken.project_ref !== ref) {
      throw Object.assign(new Error('Design token project mismatch'), { status: 403 })
    }
  }
}
