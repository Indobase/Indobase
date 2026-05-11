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
    case 'POST':
      return handlePost(req, res)
    default:
      res.setHeader('Allow', ['POST'])
      res.status(405).json({ data: null, error: { message: `Method ${method} Not Allowed` } })
  }
}

const handlePost = async (req: NextApiRequest, res: NextApiResponse) => {
  const { id } = req.query
  const { path, expiresIn = 60 * 60 * 24 } = req.body

  const { data, error } = await getStorageAdminClient().storage.from(id as string).createSignedUrl(path, expiresIn)
  if (error) {
    return res.status(400).json({ error: { message: error.message } })
  }

  // change the domain name to the SUPABASE_PUBLIC_URL since SUPABASE_URL is not accessible from the client
  const publicUrl = process.env.SUPABASE_PUBLIC_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  if (publicUrl) {
    const signedUrl = new URL(data.signedUrl)
    const parsed = new URL(publicUrl)
    signedUrl.protocol = parsed.protocol
    signedUrl.host = parsed.host
    signedUrl.port = parsed.port
    data.signedUrl = signedUrl.href
  }

  return res.status(200).json(data)
}
