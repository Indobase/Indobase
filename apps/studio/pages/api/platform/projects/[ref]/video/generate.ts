import type { NextApiRequest, NextApiResponse } from 'next'

import {
  assertCallerMatchesRef,
  statusFromError,
  withVideoApiAuth,
  type VideoApiCaller,
} from 'lib/api/saas/video-api-handler'
import { consumeVideoAiCredit } from 'lib/api/saas/video-ai-quota'
import { generateVideoStoryboard } from 'lib/api/saas/video-generate'
import { assertVideoProjectAccess } from 'lib/api/saas/video-projects'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  return withVideoApiAuth(req, res, handle)
}

async function handle(req: NextApiRequest, res: NextApiResponse, caller: VideoApiCaller) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST', 'OPTIONS'])
    return res.status(405).json({ message: `Method ${req.method} Not Allowed` })
  }

  const ref = typeof req.query.ref === 'string' ? req.query.ref.trim() : ''
  if (!ref) {
    return res.status(400).json({ message: 'Project ref is required' })
  }

  try {
    assertCallerMatchesRef(caller, ref)
    const { project } = await assertVideoProjectAccess({ claims: caller.claims, ref })

    const consumed = await consumeVideoAiCredit(project.organization_slug, 1)
    if (!consumed.ok) {
      return res.status(403).json({
        code: 'video_ai_quota_exhausted',
        message: consumed.message,
        quota: consumed.quota,
        upgradeUrl: consumed.upgradeUrl,
      })
    }

    const body = (req.body || {}) as {
      prompt?: string
      durationTargetSec?: number
      aspect?: '16:9' | '9:16' | '1:1'
    }

    const draft = await generateVideoStoryboard({
      prompt: body.prompt || '',
      durationTargetSec: body.durationTargetSec,
      aspect: body.aspect,
    })

    return res.status(200).json({
      ...draft,
      quota: consumed.quota,
    })
  } catch (error) {
    return res.status(statusFromError(error)).json({
      message: error instanceof Error ? error.message : 'Video generate failed',
    })
  }
}
