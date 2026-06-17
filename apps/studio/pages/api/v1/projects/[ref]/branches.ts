import type { JwtPayload } from '@indobaseinc/indobase-js'
import type { NextApiRequest, NextApiResponse } from 'next'

import apiWrapper from 'lib/api/apiWrapper'
import {
  createProjectBranch,
  disablePreviewBranching,
  listProjectBranches,
} from 'lib/api/saas/branches'
import { IS_SAAS } from 'lib/constants'

const branchingBase = process.env.BRANCHING_PLATFORM_API_URL?.replace(/\/$/, '')

export default (req: NextApiRequest, res: NextApiResponse) =>
  apiWrapper(req, res, handler, { withAuth: true })

async function handler(req: NextApiRequest, res: NextApiResponse, claims?: JwtPayload) {
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

  if (!IS_SAAS || !claims) {
    return res.status(501).json({ message: 'Branching is not configured' })
  }

  try {
    switch (req.method) {
      case 'GET': {
        const branches = await listProjectBranches({ claims, parentRef: ref })
        return res.status(200).json(branches)
      }
      case 'POST': {
        const branch = await createProjectBranch({ claims, parentRef: ref, body: req.body ?? {} })
        return res.status(201).json(branch)
      }
      case 'DELETE': {
        await disablePreviewBranching({ claims, parentRef: ref })
        return res.status(200).json({ message: 'Preview branching disabled' })
      }
      default: {
        res.setHeader('Allow', ['GET', 'POST', 'DELETE'])
        return res.status(405).json({ message: `Method ${req.method} Not Allowed` })
      }
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    if (message.includes('not found') || message.includes('Not found')) {
      return res.status(404).json({ message })
    }
    if (message.includes('already exists')) {
      return res.status(409).json({ message })
    }
    console.error('[branches]', message, e)
    if (req.method === 'GET') {
      return res.status(200).json([])
    }
    return res.status(500).json({ message: message || 'Branch operation failed' })
  }
}
