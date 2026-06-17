import type { JwtPayload } from '@indobaseinc/indobase-js'
import type { NextApiRequest, NextApiResponse } from 'next'

import { paths } from 'api-types'
import apiWrapper from 'lib/api/apiWrapper'
import {
  deleteGitHubAuthorizationForUser,
  getGitHubAuthorizationForUser,
  isGitHubOAuthConfigured,
  upsertGitHubAuthorizationFromCode,
} from 'lib/api/saas/github-integration'

export default (req: NextApiRequest, res: NextApiResponse) =>
  apiWrapper(req, res, handler, { withAuth: true })

type GetResponse =
  paths['/platform/integrations/github/authorization']['get']['responses']['200']['content']['application/json']

type CreateBody =
  paths['/platform/integrations/github/authorization']['post']['requestBody']['content']['application/json']

async function handler(req: NextApiRequest, res: NextApiResponse, claims?: JwtPayload) {
  if (!claims) {
    return res.status(401).json({ data: null, error: { message: 'Unauthorized' } })
  }

  switch (req.method) {
    case 'GET':
      return handleGet(res, claims)
    case 'POST':
      return handlePost(req, res, claims)
    case 'DELETE':
      return handleDelete(res, claims)
    default:
      res.setHeader('Allow', ['GET', 'POST', 'DELETE'])
      return res.status(405).json({ data: null, error: { message: `Method ${req.method} Not Allowed` } })
  }
}

const handleGet = async (res: NextApiResponse<GetResponse>, claims: JwtPayload) => {
  const authorization = await getGitHubAuthorizationForUser(claims as any)
  if (!authorization) {
    return res.status(404).json({ message: 'GitHub authorization not found' } as any)
  }
  return res.status(200).json(authorization)
}

const handlePost = async (req: NextApiRequest, res: NextApiResponse, claims: JwtPayload) => {
  if (!isGitHubOAuthConfigured()) {
    return res.status(503).json({
      message:
        'GitHub OAuth is not configured. Set GITHUB_CLIENT_ID and GITHUB_SECRET (or GITHUB_INTEGRATION_CLIENT_ID / GITHUB_INTEGRATION_CLIENT_SECRET).',
    })
  }

  const raw = req.body
  const body = (typeof raw === 'string' ? JSON.parse(raw) : raw) as CreateBody
  if (!body?.code) {
    return res.status(400).json({ message: 'Missing OAuth code' })
  }

  await upsertGitHubAuthorizationFromCode({ claims: claims as any, code: body.code })
  return res.status(201).end()
}

const handleDelete = async (res: NextApiResponse, claims: JwtPayload) => {
  const removed = await deleteGitHubAuthorizationForUser(claims as any)
  if (!removed) {
    return res.status(404).json({ message: 'GitHub authorization not found' })
  }
  return res.status(200).end()
}
