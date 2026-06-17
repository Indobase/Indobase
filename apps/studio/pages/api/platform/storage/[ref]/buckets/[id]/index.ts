import type { JwtPayload } from '@indobaseinc/indobase-js'
import apiWrapper from 'lib/api/apiWrapper'
import { setNoStore } from 'lib/api/no-store'
import { getStorageAdminClientFromRequest } from 'lib/api/storage-admin'
import { NextApiRequest, NextApiResponse } from 'next'

export default (req: NextApiRequest, res: NextApiResponse) =>
  apiWrapper(req, res, handler, { withAuth: true })

async function handler(req: NextApiRequest, res: NextApiResponse, claims?: JwtPayload) {
  setNoStore(res)
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
      res.status(405).json({ data: null, error: { message: `Method ${method} Not Allowed` } })
  }
}

const handleGet = async (req: NextApiRequest, res: NextApiResponse, claims?: JwtPayload) => {
  const { id } = req.query
  const supabase = await getStorageAdminClientFromRequest(req, claims)

  const { data, error } = await supabase.storage.getBucket(id as string)
  if (error) {
    return res.status(400).json({ error: { message: error.message } })
  }

  return res.status(200).json(data)
}

const handlePatch = async (req: NextApiRequest, res: NextApiResponse, claims?: JwtPayload) => {
  const { id } = req.query
  const {
    public: isPublicBucket,
    allowed_mime_types: allowedMimeTypes,
    file_size_limit: fileSizeLimit,
  } = req.body
  const supabase = await getStorageAdminClientFromRequest(req, claims)

  const { data, error } = await supabase.storage.updateBucket(id as string, {
    public: isPublicBucket,
    allowedMimeTypes,
    fileSizeLimit,
  })
  if (error) {
    return res.status(400).json({ error: { message: error.message } })
  }

  return res.status(200).json(data)
}

const handleDelete = async (req: NextApiRequest, res: NextApiResponse, claims?: JwtPayload) => {
  const { id } = req.query
  const supabase = await getStorageAdminClientFromRequest(req, claims)

  const { data, error } = await supabase.storage.deleteBucket(id as string)
  if (error) {
    return res.status(400).json({ error: { message: error.message } })
  }

  return res.status(200).json(data)
}
