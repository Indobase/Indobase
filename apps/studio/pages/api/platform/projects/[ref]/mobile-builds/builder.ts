import type { NextApiRequest, NextApiResponse } from 'next'

import {
  builderMcpClaimsToJwtPayload,
  readBearerToken,
  verifyBuilderMcpToken,
} from 'lib/api/saas/builder-mcp-auth'
import { setNoStore } from 'lib/api/no-store'
import {
  createProjectMobileBuild,
  type ProjectMobileBuildFramework,
  type ProjectMobileBuildProfile,
  type ProjectMobileBuildTarget,
} from 'lib/api/saas/mobile-builds'
import { stageMobileBuildSource } from 'lib/api/saas/mobile-build-source'

type CreateMobileBuildBody = {
  framework?: ProjectMobileBuildFramework
  metadata?: Record<string, unknown>
  profile?: ProjectMobileBuildProfile
  sourceFiles?: Record<string, string>
  target?: ProjectMobileBuildTarget
}

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '12mb',
    },
  },
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  setNoStore(res)

  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST'])
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

  const body = (req.body || {}) as CreateMobileBuildBody
  const claims = builderMcpClaimsToJwtPayload(builderClaims)

  try {
    let stagedSource:
      | {
          buildId: string
          fileCount: number
          sourcePath: string
          totalBytes: number
        }
      | undefined

    if (body.sourceFiles && Object.keys(body.sourceFiles).length > 0) {
      stagedSource = await stageMobileBuildSource({
        files: body.sourceFiles,
        projectRef: ref,
      })
    }

    const build = await createProjectMobileBuild({
      buildId: stagedSource?.buildId,
      claims,
      framework: body.framework,
      metadata: {
        ...body.metadata,
        builder_session: true,
        requested_from: 'indobase-builder',
        ...(stagedSource
          ? {
              source_path: stagedSource.sourcePath,
              staged_file_count: stagedSource.fileCount,
              staged_source_bytes: stagedSource.totalBytes,
            }
          : {}),
      },
      profile: body.profile,
      ref,
      requestedVia: 'builder',
      target: body.target,
    })

    return res.status(201).json(build)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to queue mobile build'
    const status = message.includes('already in progress') ? 409 : 400
    return res.status(status).json({ message })
  }
}
