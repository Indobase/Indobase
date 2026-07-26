import type { NextApiRequest, NextApiResponse } from 'next'

import type { JwtPayload } from '@indobaseinc/indobase-js'

import apiWrapper from 'lib/api/apiWrapper'
import { setNoStore } from 'lib/api/no-store'
import {
  applyVideoCors,
  makeVideoApiToken,
  readBearerToken,
  verifyVideoApiToken,
  videoApiClaimsToJwtPayload,
  type VideoApiTokenPayload,
} from 'lib/api/saas/video-api-auth'
import { getStudioOrigin } from 'lib/api/saas/video-launch'

export type VideoApiCaller = {
  claims: JwtPayload & Record<string, unknown>
  auth: 'studio' | 'video-api'
  videoToken?: VideoApiTokenPayload
}

/**
 * Dual auth for Video platform APIs:
 * - Studio cookie session (apiWrapper)
 * - Bearer Video API token (from Video SSO / proxy)
 */
export async function withVideoApiAuth(
  req: NextApiRequest,
  res: NextApiResponse,
  handler: (req: NextApiRequest, res: NextApiResponse, caller: VideoApiCaller) => Promise<unknown>
) {
  setNoStore(res)
  applyVideoCors(req, res)

  if (req.method === 'OPTIONS') {
    return res.status(204).end()
  }

  const bearer = readBearerToken(req.headers.authorization)
  if (bearer) {
    try {
      const videoToken = verifyVideoApiToken(bearer)
      const claims = videoApiClaimsToJwtPayload(videoToken) as JwtPayload & Record<string, unknown>
      return await handler(req, res, { claims, auth: 'video-api', videoToken })
    } catch (error) {
      return res.status(401).json({
        message: error instanceof Error ? error.message : 'Invalid Video API token',
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
  if (message.includes('grant you video') || message.includes('forbidden')) return 403
  if (message.includes('required') || message.includes('invalid')) return 400
  return 500
}

/** Mint a Video API bearer for the Video SSO proxy (server-side). */
export function mintVideoApiTokenFromSession(session: {
  sub: string
  email: string
  project_ref: string
  project_name?: string
  organization_slug: string
  role: string
}): string {
  return makeVideoApiToken({
    email: session.email,
    iss: getStudioOrigin(),
    organization_slug: session.organization_slug,
    project_name: session.project_name,
    project_ref: session.project_ref,
    role: session.role,
    studio_url: getStudioOrigin(),
    sub: session.sub,
  })
}

export function assertCallerMatchesRef(caller: VideoApiCaller, ref: string): void {
  if (caller.videoToken && caller.videoToken.project_ref !== ref) {
    throw Object.assign(new Error('Video token does not match this project'), { status: 403 })
  }
}
