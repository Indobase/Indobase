import type { JwtPayload } from 'indobase-js'
import type { NextApiRequest, NextApiResponse } from 'next'

import apiWrapper from 'lib/api/apiWrapper'

// Database branching requires separate Postgres per branch. Model A (single DB + RLS)
// does not provide that locally. Optionally set BRANCHING_PLATFORM_API_URL to an
// external branching/control service (same API shape as Supabase) to proxy requests.

const branchingBase = process.env.BRANCHING_PLATFORM_API_URL?.replace(/\/$/, '')

export default (req: NextApiRequest, res: NextApiResponse) =>
  apiWrapper(req, res, handler, { withAuth: true })

async function handler(req: NextApiRequest, res: NextApiResponse, _claims?: JwtPayload) {
  const ref = typeof req.query.ref === 'string' ? req.query.ref : Array.isArray(req.query.ref) ? req.query.ref[0] : ''
  if (!ref) {
    return res.status(400).json({ message: 'Missing project ref' })
  }

  if (branchingBase) {
    const incomingPath = req.url?.split('?')[0] ?? ''
    const idx = incomingPath.indexOf('/branches')
    const suffix = idx >= 0 ? incomingPath.slice(idx + '/branches'.length) : ''
    const search = req.url?.includes('?') ? `?${req.url!.split('?')[1]}` : ''
    const target = `${branchingBase}/v1/projects/${encodeURIComponent(ref)}/branches${suffix}${search}`

    const headers = new Headers()
    const auth = req.headers.authorization
    if (typeof auth === 'string') headers.set('authorization', auth)
    headers.set('accept', 'application/json')
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      headers.set('content-type', 'application/json')
    }

    const body =
      req.method && ['GET', 'HEAD'].includes(req.method) ? undefined : JSON.stringify(req.body ?? {})

    const upstream = await fetch(target, {
      method: req.method,
      headers,
      body,
    })
    res.status(upstream.status)
    upstream.headers.forEach((value, key) => {
      if (key.toLowerCase() === 'transfer-encoding') return
      res.setHeader(key, value)
    })
    const text = await upstream.text()
    return res.send(text)
  }

  switch (req.method) {
    case 'GET':
      return res.status(200).json([])
    case 'POST':
    case 'DELETE':
    case 'PATCH':
      return res.status(422).json({
        message: 'Preview branching is not enabled for this project.',
        reason:
          'Indobase SaaS runs in single-DB RLS mode (Model A). Database branching ' +
          'requires per-branch Postgres instances. Set BRANCHING_PLATFORM_API_URL to proxy ' +
          'to an external branching API, or provision isolated data planes per project (tenant `restUrl` ' +
          'from the platform project detail API targets `ref.<public-domain>` when a dedicated DB exists).',
      })
    default: {
      res.setHeader('Allow', ['GET', 'POST', 'DELETE', 'PATCH'])
      return res.status(405).json({ message: `Method ${req.method} Not Allowed` })
    }
  }
}
