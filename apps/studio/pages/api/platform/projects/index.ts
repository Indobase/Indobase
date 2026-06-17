import { NextApiRequest, NextApiResponse } from 'next'

import apiWrapper from 'lib/api/apiWrapper'
import type { JwtPayload } from '@indobaseinc/indobase-js'
import { createProject, listProjects } from 'lib/api/saas/platform'

export default (req: NextApiRequest, res: NextApiResponse) =>
  apiWrapper(req, res, handler, { withAuth: true })

async function handler(req: NextApiRequest, res: NextApiResponse, claims?: JwtPayload) {
  const { method } = req

  switch (method) {
    case 'GET':
      return handleGetAll(req, res, claims)
    case 'POST':
      return handlePost(req, res, claims)
    default:
      res.setHeader('Allow', ['GET', 'POST'])
      res.status(405).json({ data: null, error: { message: `Method ${method} Not Allowed` } })
  }
}

const parseRequestBody = (body: NextApiRequest['body']) => {
  if (typeof body !== 'string') return body ?? {}
  try {
    return JSON.parse(body)
  } catch {
    return null
  }
}

const handleGetAll = async (req: NextApiRequest, res: NextApiResponse, claims?: JwtPayload) => {
  try {
    // Platform list endpoint (Studio uses it for infinite scrolling)
    const limit = typeof req.query.limit === 'string' ? parseInt(req.query.limit, 10) : undefined
    const offset = typeof req.query.offset === 'string' ? parseInt(req.query.offset, 10) : undefined
    const search = typeof req.query.search === 'string' ? req.query.search : undefined

    return res.status(200).json(
      await listProjects({
        claims: claims as any,
        limit: Number.isFinite(limit) ? limit : undefined,
        offset: Number.isFinite(offset) ? offset : undefined,
        search,
      })
    )
  } catch (error: any) {
    return res.status(500).json({ message: error?.message ?? 'Failed to list projects' })
  }
}

const handlePost = async (req: NextApiRequest, res: NextApiResponse, claims?: JwtPayload) => {
  try {
    const body = parseRequestBody(req.body)
    if (body === null) return res.status(400).json({ message: 'Invalid JSON body' })

    return res.status(200).json(
      await createProject({
        claims: claims as any,
        body,
      })
    )
  } catch (error: any) {
    return res.status(400).json({ message: error?.message ?? 'Failed to create project' })
  }
}
