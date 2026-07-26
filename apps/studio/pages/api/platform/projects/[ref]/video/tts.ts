import type { NextApiRequest, NextApiResponse } from 'next'

import {
  assertCallerMatchesRef,
  statusFromError,
  withVideoApiAuth,
  type VideoApiCaller,
} from 'lib/api/saas/video-api-handler'
import { consumeVideoAiCredit } from 'lib/api/saas/video-ai-quota'
import { assertVideoProjectAccess } from 'lib/api/saas/video-projects'
import { isVideoTtsConfigured, synthesizeVideoNarration } from 'lib/api/saas/video-tts'

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

    if (!isVideoTtsConfigured()) {
      return res.status(200).json({
        available: false,
        message: 'Voice narration unavailable — no ElevenLabs or OpenAI TTS key configured.',
      })
    }

    const consumed = await consumeVideoAiCredit(project.organization_slug, 1)
    if (!consumed.ok) {
      return res.status(403).json({
        code: 'video_ai_quota_exhausted',
        message: consumed.message,
        quota: consumed.quota,
        upgradeUrl: consumed.upgradeUrl,
      })
    }

    const body = (req.body || {}) as { text?: string; voice?: string }
    const result = await synthesizeVideoNarration({
      text: body.text || '',
      voice: body.voice,
    })

    return res.status(200).json({
      ...result,
      quota: consumed.quota,
    })
  } catch (error) {
    return res.status(statusFromError(error)).json({
      message: error instanceof Error ? error.message : 'Video TTS failed',
    })
  }
}
