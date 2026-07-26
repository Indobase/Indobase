import type { NextApiRequest, NextApiResponse } from 'next'

import {
  assertCallerMatchesRef,
  statusFromError,
  withDesignApiAuth,
  type DesignApiCaller,
} from 'lib/api/saas/design-api-handler'
import { consumeDesignAiCredit } from 'lib/api/saas/design-ai-quota'
import { generateDesignDraft } from 'lib/api/saas/design-generate'
import {
  DESIGN_ROLE_DENIED_CODE,
  getDesignLaunchRedirect,
  isDesignRoleDeniedMessage,
} from 'lib/api/saas/design-launch'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  return withDesignApiAuth(req, res, handle)
}

async function handle(req: NextApiRequest, res: NextApiResponse, caller: DesignApiCaller) {
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

    // Reuse Design launch access check (same roles as Open Design).
    let orgSlug = caller.designToken?.organization_slug || ''
    if (caller.auth === 'studio') {
      const launch = await getDesignLaunchRedirect({
        claims: caller.claims,
        ref,
      })
      orgSlug = launch.project.organization_slug
    } else if (!orgSlug) {
      return res.status(400).json({ message: 'Organization slug is required' })
    }

    const consumed = await consumeDesignAiCredit(orgSlug, 1)
    if (!consumed.ok) {
      return res.status(403).json({
        code: 'design_ai_quota_exhausted',
        message: consumed.message,
        quota: consumed.quota,
        upgradeUrl: consumed.upgradeUrl,
      })
    }

    const body = (req.body || {}) as {
      prompt?: string
      width?: number
      height?: number
      category?: string
    }

    const draft = await generateDesignDraft({
      prompt: body.prompt || '',
      width: body.width,
      height: body.height,
      category: body.category,
    })

    return res.status(200).json({
      ...draft,
      quota: consumed.quota,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Design generate failed'
    if (isDesignRoleDeniedMessage(message)) {
      return res.status(403).json({
        code: DESIGN_ROLE_DENIED_CODE,
        message:
          'Ask an organization owner or admin to grant you Design access. Developers and viewers can open Design once they are members of this organization.',
      })
    }
    return res.status(statusFromError(error)).json({ message })
  }
}
