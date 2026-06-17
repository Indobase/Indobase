import type { JwtPayload } from '@indobaseinc/indobase-js'
import type { NextApiRequest, NextApiResponse } from 'next'

import { paths } from 'api-types'
import apiWrapper from 'lib/api/apiWrapper'
import { checkGitHubBranchExists } from 'lib/api/saas/github-integration'

export default (req: NextApiRequest, res: NextApiResponse) =>
  apiWrapper(req, res, handler, { withAuth: true })

type ResponseData =
  paths['/platform/integrations/github/repositories/{repository_id}/branches/{branch_name}']['get']['responses']['200']['content']['application/json']

function parseRepositoryId(req: NextApiRequest): number | null {
  const raw = req.query.repository_id
  const s = typeof raw === 'string' ? raw : Array.isArray(raw) ? raw[0] : ''
  const n = Number.parseInt(s, 10)
  return Number.isFinite(n) ? n : null
}

function parseBranchName(req: NextApiRequest): string {
  const raw = req.query.branch_name
  return typeof raw === 'string' ? raw : Array.isArray(raw) ? raw[0] : ''
}

async function handler(req: NextApiRequest, res: NextApiResponse, claims?: JwtPayload) {
  if (!claims) {
    return res.status(401).json({ data: null, error: { message: 'Unauthorized' } })
  }

  switch (req.method) {
    case 'GET':
      return handleGet(req, res, claims)
    default:
      res.setHeader('Allow', ['GET'])
      return res.status(405).json({ data: null, error: { message: `Method ${req.method} Not Allowed` } })
  }
}

const handleGet = async (
  req: NextApiRequest,
  res: NextApiResponse<ResponseData>,
  claims: JwtPayload
) => {
  const repositoryId = parseRepositoryId(req)
  const branchName = parseBranchName(req)
  if (!repositoryId || !branchName) {
    return res.status(400).json({ message: 'repository_id and branch_name are required' } as any)
  }

  const branch = await checkGitHubBranchExists({
    claims: claims as any,
    repositoryId,
    branchName,
  })

  if (!branch) {
    return res.status(404).json({ message: 'Branch not found' } as any)
  }

  return res.status(200).json(branch)
}
