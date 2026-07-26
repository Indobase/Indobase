import type { NextApiRequest, NextApiResponse } from 'next'

import {
  assertCallerMatchesRef,
  statusFromError,
  withVideoApiAuth,
  type VideoApiCaller,
} from 'lib/api/saas/video-api-handler'
import { getVideoAiQuota } from 'lib/api/saas/video-ai-quota'
import { assertVideoProjectAccess } from 'lib/api/saas/video-projects'
import { isVideoTtsConfigured } from 'lib/api/saas/video-tts'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  return withVideoApiAuth(req, res, handle)
}

async function handle(req: NextApiRequest, res: NextApiResponse, caller: VideoApiCaller) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET', 'OPTIONS'])
    return res.status(405).json({ message: `Method ${req.method} Not Allowed` })
  }

  const ref = typeof req.query.ref === 'string' ? req.query.ref.trim() : ''
  if (!ref) {
    return res.status(400).json({ message: 'Project ref is required' })
  }

  try {
    assertCallerMatchesRef(caller, ref)
    const { project } = await assertVideoProjectAccess({ claims: caller.claims, ref })
    const quota = await getVideoAiQuota(project.organization_slug)
    if (!quota) {
      return res.status(404).json({ message: 'Organization not found' })
    }

    return res.status(200).json({
      ...quota,
      ttsAvailable: isVideoTtsConfigured(),
      upgradeUrl: `/org/${encodeURIComponent(project.organization_slug)}/billing?panel=subscriptionPlan`,
    })
  } catch (error) {
    return res.status(statusFromError(error)).json({
      message: error instanceof Error ? error.message : 'Video quota request failed',
    })
  }
}
