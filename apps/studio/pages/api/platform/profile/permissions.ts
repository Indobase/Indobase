import { NextApiRequest, NextApiResponse } from 'next'

const proxyTarget = process.env.PLATFORM_API_PROXY

function isProxyLoopback(req: NextApiRequest, proxyTarget: string) {
  try {
    const target = new URL(proxyTarget)
    const requestHost = req.headers.host
    return !!requestHost && target.host === requestHost
  } catch {
    return false
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!proxyTarget) {
    res.status(500).json({ message: 'PLATFORM_API_PROXY is not configured' })
    return
  }

  if (isProxyLoopback(req, proxyTarget)) {
    res.status(500).json({
      message:
        'PLATFORM_API_PROXY appears to point back to this Studio host (would recurse). Please set it to the external Platform API base URL (no trailing /api).',
    })
    return
  }

  const targetUrl = `${proxyTarget}${req.url?.replace(/^\/api/, '') ?? ''}`
  const headers = new Headers()
  Object.entries(req.headers).forEach(([key, value]) => {
    if (typeof value === 'string') headers.set(key, value)
  })
  const body =
    req.method && ['GET', 'HEAD'].includes(req.method) ? undefined : JSON.stringify(req.body ?? {})
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
