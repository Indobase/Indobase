import type { JwtPayload } from '@indobaseinc/indobase-js'
import type { NextApiRequest, NextApiResponse } from 'next'

import {
  builderMcpClaimsToJwtPayload,
  readBearerToken,
  verifyBuilderMcpToken,
} from 'lib/api/saas/builder-mcp-auth'
import { buildBuilderBackendConfig, getStudioOrigin } from 'lib/api/saas/builder-launch'
import { setNoStore } from 'lib/api/no-store'
import { getProject } from 'lib/api/saas/platform'
import { getProjectSettingsForRef } from 'lib/api/saas/settings'

/**
 * Returns the tenant backend config (anon key, API/rest/storage URLs, public env) for a project,
 * authenticated by a Builder MCP token. Lets the Builder rebuild a full connection from just its
 * MCP cookie when localStorage was cleared — no fresh Studio launch required.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  setNoStore(res)

  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', ['GET', 'POST'])
    return res.status(405).json({ message: `Method ${req.method} Not Allowed` })
  }

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

  const claims = builderMcpClaimsToJwtPayload(builderClaims)

  try {
    // getProject wants Claims (JwtPayload & Record<string, unknown>); getProjectSettingsForRef wants JwtPayload.
    const project = await getProject({ claims: claims as JwtPayload & Record<string, unknown>, ref })
    if (!project) {
      return res.status(404).json({ message: 'Project not found' })
    }

    const settings = await getProjectSettingsForRef({ claims, ref })
    if (!settings) {
      return res.status(404).json({ message: 'Project settings not found' })
    }

    const studioUrl = getStudioOrigin()
    const backend = buildBuilderBackendConfig({
      projectName: project.name,
      projectRef: project.ref,
      settings,
      studioUrl,
    })

    return res.status(200).json({
      backend,
      project_name: project.name,
      organization_slug: project.organization_slug,
      studio_url: studioUrl,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load project backend config'
    return res.status(400).json({ message })
  }
}
