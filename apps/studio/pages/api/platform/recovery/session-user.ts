import type { NextApiRequest, NextApiResponse } from 'next'

import apiWrapper from 'lib/api/apiWrapper'
import { gotrueUserUrl, resolveDirectGotrueUrl } from 'lib/gotrue-direct-url'

/**
 * Proxies GoTrue `GET /user` via direct GoTrue (bypasses broken Kong anon key).
 */
export default (req: NextApiRequest, res: NextApiResponse) => apiWrapper(req, res, handler)

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { method } = req

  switch (method) {
    case 'GET':
      return handleGet(req, res)
    default:
      res.setHeader('Allow', ['GET'])
      return res
        .status(405)
        .json({ error: { message: `Method ${method} Not Allowed` }, data: null })
  }
}

async function handleGet(req: NextApiRequest, res: NextApiResponse) {
  const authorization = req.headers.authorization
  if (!authorization || !authorization.toLowerCase().startsWith('bearer ')) {
    return res.status(401).json({ message: 'Invalid authentication credentials' })
  }

  const gotrueBase = resolveDirectGotrueUrl()
  const userUrl = gotrueUserUrl(gotrueBase)

  const timeoutMs = parseInt(process.env.GOTRUE_USER_GET_TIMEOUT_MS || '8000', 10)
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(userUrl, {
      method: 'GET',
      headers: { Authorization: authorization },
      signal: controller.signal,
    })

    const text = await response.text()
    let json: Record<string, unknown> | null = null
    try {
      json = text ? JSON.parse(text) : null
    } catch {
      json = null
    }

    if (!response.ok) {
      const message =
        (typeof json?.msg === 'string' && json.msg) ||
        (typeof json?.message === 'string' && json.message) ||
        text ||
        'Failed to load user'

      return res.status(response.status).json({
        ...(json ?? {}),
        message,
      })
    }

    return res.status(response.status).json(json ?? {})
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    return res.status(502).json({
      message: 'Failed to reach GoTrue user endpoint',
      error: message,
    })
  } finally {
    clearTimeout(timeoutId)
  }
}
