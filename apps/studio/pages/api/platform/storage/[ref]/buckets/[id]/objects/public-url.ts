import apiWrapper from 'lib/api/apiWrapper'
import { getStorageAdminClient } from 'lib/api/storage-admin'
import { NextApiRequest, NextApiResponse } from 'next'

export default (req: NextApiRequest, res: NextApiResponse) => apiWrapper(req, res, handler)

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { method } = req

  switch (method) {
    case 'POST':
      return handlePost(req, res)
    default:
      res.setHeader('Allow', ['POST'])
      res.status(405).json({ data: null, error: { message: `Method ${method} Not Allowed` } })
  }
}

const handlePost = async (req: NextApiRequest, res: NextApiResponse) => {
  const { id } = req.query
  const { path } = req.body

  const { data } = getStorageAdminClient().storage.from(id as string).getPublicUrl(path)

  // change the domain name to the SUPABASE_PUBLIC_URL since SUPABASE_URL is not accessible from the client
  const publicEnv = process.env.SUPABASE_PUBLIC_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  if (publicEnv) {
    const publicUrl = new URL(data.publicUrl)
    const parsed = new URL(publicEnv)
    publicUrl.protocol = parsed.protocol
    publicUrl.host = parsed.host
    publicUrl.port = parsed.port
    data.publicUrl = publicUrl.href
  }

  return res.status(200).json(data)
}
