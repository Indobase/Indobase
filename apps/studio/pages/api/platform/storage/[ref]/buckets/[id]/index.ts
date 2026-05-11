import apiWrapper from 'lib/api/apiWrapper'
import { setNoStore } from 'lib/api/no-store'
import { getStorageAdminClient } from 'lib/api/storage-admin'
import { NextApiRequest, NextApiResponse } from 'next'

export default (req: NextApiRequest, res: NextApiResponse) =>
  apiWrapper(req, res, handler, { withAuth: true })

async function handler(req: NextApiRequest, res: NextApiResponse) {
  setNoStore(res)
  const { method } = req

  switch (method) {
    case 'GET':
      return handleGet(req, res)
    case 'PATCH':
      return handlePatch(req, res)
    case 'DELETE':
      return handleDelete(req, res)
    default:
      res.setHeader('Allow', ['GET', 'PATCH', 'DELETE'])
      res.status(405).json({ data: null, error: { message: `Method ${method} Not Allowed` } })
  }
}

const handleGet = async (req: NextApiRequest, res: NextApiResponse) => {
  const { id } = req.query

  const { data, error } = await getStorageAdminClient().storage.getBucket(id as string)
  if (error) {
    return res.status(400).json({ error: { message: error.message } })
  }

  return res.status(200).json(data)
}

const handlePatch = async (req: NextApiRequest, res: NextApiResponse) => {
  const { id } = req.query
  const {
    public: isPublicBucket,
    allowed_mime_types: allowedMimeTypes,
    file_size_limit: fileSizeLimit,
  } = req.body

  const { data, error } = await getStorageAdminClient().storage.updateBucket(id as string, {
    public: isPublicBucket,
    allowedMimeTypes,
    fileSizeLimit,
  })
  if (error) {
    return res.status(400).json({ error: { message: error.message } })
  }

  return res.status(200).json(data)
}

const handleDelete = async (req: NextApiRequest, res: NextApiResponse) => {
  const { id } = req.query

  const { data, error } = await getStorageAdminClient().storage.deleteBucket(id as string)
  if (error) {
    return res.status(400).json({ error: { message: error.message } })
  }

  return res.status(200).json(data)
}
