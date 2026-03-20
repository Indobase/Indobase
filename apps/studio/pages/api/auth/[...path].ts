import { NextApiRequest, NextApiResponse } from 'next'

const resolveGoTrueUrl = () => {
  if (process.env.GOTRUE_URL) return process.env.GOTRUE_URL
  if (process.env.SUPABASE_URL)
    return `${process.env.SUPABASE_URL.replace(/\/$/, '')}/auth/v1`
  return undefined
}

const buildProxyBody = async (req: NextApiRequest): Promise<string | undefined> => {
  if (!req.method || ['GET', 'HEAD'].includes(req.method)) return undefined

  const chunks: any[] = []
  for await (const chunk of req) {
    chunks.push(chunk)
  }
  return Buffer.concat(chunks).toString('utf-8')
}

export const config = {
  api: {
    bodyParser: false,
    externalResolver: true,
  },
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const gotrueUrl = resolveGoTrueUrl()
  if (!gotrueUrl) {
    res.status(500).json({ message: 'Missing GOTRUE_URL (or SUPABASE_URL)' })
    return
  }

  const basePath = '/api/auth/v1'
  const requestPath = req.url?.startsWith(basePath) ? req.url.slice(basePath.length) : req.url ?? ''
  const targetUrl = `${gotrueUrl.replace(/\/$/, '')}/${requestPath.replace(/^\//, '')}`

  const headers = new Headers()
  Object.entries(req.headers).forEach(([key, value]) => {
    if (typeof value === 'string') headers.set(key, value)
  })

  const body = await buildProxyBody(req)

  const response = await fetch(targetUrl, {
    method: req.method,
    headers,
    body,
  })

  res.status(response.status)
  response.headers.forEach((value, key) => {
    if (key.toLowerCase() === 'transfer-encoding') return
    res.setHeader(key, value)
  })

  const text = await response.text()
  res.send(text)
}
