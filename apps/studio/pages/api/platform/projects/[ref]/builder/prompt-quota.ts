import type { NextApiRequest, NextApiResponse } from 'next'

import {
  builderMcpClaimsToJwtPayload,
  readBearerToken,
  verifyBuilderMcpToken,
} from 'lib/api/saas/builder-mcp-auth'
import {
  consumeBuilderPrompt,
  getBuilderPromptQuota,
} from 'lib/api/saas/builder-prompt-quota'
import { setNoStore } from 'lib/api/no-store'
import { getProject } from 'lib/api/saas/platform'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  setNoStore(res)

  const ref = typeof req.query.ref === 'string' ? req.query.ref.trim() : ''
  if (!ref) {
    return res.status(400).json({ message: 'Project ref is required' })
  }

  const token = readBearerToken(req.headers.authorization)
  if (!token) {
    return res.status(401).json({ message: 'Builder authorization token is required' })
  }

  let builderClaims
  try {
    builderClaims = verifyBuilderMcpToken(token)
  } catch (error) {
    return res.status(401).json({
      message: error instanceof Error ? error.message : 'Invalid Builder authorization token',
    })
  }

  if (builderClaims.project_ref !== ref) {
    return res.status(403).json({ message: 'Builder token does not match this project' })
  }

  const project = await getProject({
    claims: builderMcpClaimsToJwtPayload(builderClaims),
    ref,
  })

  if (!project) {
    return res.status(404).json({ message: 'Project not found' })
  }

  if (project.organization_slug !== builderClaims.organization_slug) {
    return res.status(403).json({ message: 'Builder token organization mismatch' })
  }

  const orgSlug = builderClaims.organization_slug

  try {
    if (req.method === 'GET') {
      const quota = await getBuilderPromptQuota(orgSlug)
      if (!quota) {
        return res.status(404).json({ message: 'Organization not found' })
      }

      return res.status(200).json({
        ...quota,
        upgradeUrl: `/org/${encodeURIComponent(orgSlug)}/billing?panel=subscriptionPlan`,
      })
    }

    if (req.method === 'POST') {
      const result = await consumeBuilderPrompt(orgSlug)

      if (!result.ok) {
        return res.status(402).json({
          message: 'Free Builder limit reached (5 prompts). Upgrade to Pro to continue.',
          ...result.quota,
          upgradeUrl: result.upgradeUrl,
        })
      }

      return res.status(200).json({
        ...result.quota,
        upgradeUrl: `/org/${encodeURIComponent(orgSlug)}/billing?panel=subscriptionPlan`,
      })
    }

    res.setHeader('Allow', ['GET', 'POST'])
    return res.status(405).json({ message: `Method ${req.method} Not Allowed` })
  } catch (error) {
    return res.status(500).json({
      message: error instanceof Error ? error.message : 'Failed to resolve Builder prompt quota',
    })
  }
}
