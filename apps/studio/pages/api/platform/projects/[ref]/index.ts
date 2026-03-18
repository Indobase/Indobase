import { NextApiRequest, NextApiResponse } from 'next'

import apiWrapper from 'lib/api/apiWrapper'
import type { JwtPayload } from '@supabase/supabase-js'
import { deleteProject, getProject, updateProject } from 'lib/api/self-hosted/platform'

export default (req: NextApiRequest, res: NextApiResponse) =>
  apiWrapper(req, res, handler, { withAuth: true })

async function handler(req: NextApiRequest, res: NextApiResponse, claims?: JwtPayload) {
  const { method } = req

  switch (method) {
    case 'GET':
      return handleGet(req, res, claims)
    case 'PATCH':
      return handlePatch(req, res, claims)
    case 'DELETE':
      return handleDelete(req, res, claims)
    default:
      res.setHeader('Allow', ['GET', 'PATCH', 'DELETE'])
      res.status(405).json({ message: `Method ${method} Not Allowed` })
  }
}

const handleGet = async (req: NextApiRequest, res: NextApiResponse, claims?: JwtPayload) => {
  const { ref } = req.query
  if (typeof ref !== 'string' || !ref) return res.status(400).json({ message: 'Project ref is required' })

  const project = await getProject({ claims: claims as any, ref })
  if (!project) return res.status(404).json({ message: 'Project not found' })
  return res.status(200).json(project)
}

const handlePatch = async (req: NextApiRequest, res: NextApiResponse, claims?: JwtPayload) => {
  const { ref } = req.query
  if (typeof ref !== 'string' || !ref) return res.status(400).json({ message: 'Project ref is required' })

  const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body ?? {}
  const updated = await updateProject({
    claims: claims as any,
    ref,
    updates: { name: body?.name },
  })

  if (!updated) return res.status(404).json({ message: 'Project not found' })
  return res.status(200).json(updated)
}

const handleDelete = async (req: NextApiRequest, res: NextApiResponse, claims?: JwtPayload) => {
  const { ref } = req.query
  if (typeof ref !== 'string' || !ref) return res.status(400).json({ message: 'Project ref is required' })

  const deleted = await deleteProject({ claims: claims as any, ref })
  if (!deleted) return res.status(404).json({ message: 'Project not found' })

  return res.status(200).json(deleted)
}
