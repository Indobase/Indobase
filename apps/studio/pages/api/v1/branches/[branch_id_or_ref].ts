import type { JwtPayload } from '@indobaseinc/indobase-js'
import type { NextApiRequest, NextApiResponse } from 'next'

import apiWrapper from 'lib/api/apiWrapper'
import {
  deleteBranchByRef,
  getBranchByRef,
  updateBranchByRef,
} from 'lib/api/saas/branches'
import { IS_SAAS } from 'lib/constants'

const branchingBase = process.env.BRANCHING_PLATFORM_API_URL?.replace(/\/$/, '')

export default (req: NextApiRequest, res: NextApiResponse) =>
  apiWrapper(req, res, handler, { withAuth: true })

async function handler(req: NextApiRequest, res: NextApiResponse, claims?: JwtPayload) {
  const branchIdOrRef =
    typeof req.query.branch_id_or_ref === 'string'
      ? req.query.branch_id_or_ref
      : Array.isArray(req.query.branch_id_or_ref)
        ? req.query.branch_id_or_ref[0]
        : ''
  if (!branchIdOrRef) {
    return res.status(400).json({ message: 'Missing branch id or ref' })
  }

  if (branchingBase) {
    const target = `${branchingBase}/v1/branches/${encodeURIComponent(branchIdOrRef)}`
    const headers = new Headers()
    const auth = req.headers.authorization
    if (typeof auth === 'string') headers.set('authorization', auth)
    headers.set('accept', 'application/json')
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      headers.set('content-type', 'application/json')
    }
    const body =
      req.method && ['GET', 'HEAD'].includes(req.method) ? undefined : JSON.stringify(req.body ?? {})
    const upstream = await fetch(target, { method: req.method, headers, body })
    res.status(upstream.status)
    upstream.headers.forEach((value, key) => {
      if (key.toLowerCase() === 'transfer-encoding') return
      res.setHeader(key, value)
    })
    return res.send(await upstream.text())
  }

  if (!IS_SAAS || !claims) {
    return res.status(501).json({ message: 'Branching is not configured' })
  }

  try {
    switch (req.method) {
      case 'GET': {
        const branch = await getBranchByRef({ claims, branchRef: branchIdOrRef })
        if (!branch) return res.status(404).json({ message: 'Branch not found' })
        return res.status(200).json(branch)
      }
      case 'PATCH': {
        const result = await updateBranchByRef({
          claims,
          branchRef: branchIdOrRef,
          body: req.body ?? {},
        })
        return res.status(200).json(result)
      }
      case 'DELETE': {
        await deleteBranchByRef({ claims, branchRef: branchIdOrRef })
        return res.status(200).json({ message: 'Branch deleted' })
      }
      default: {
        res.setHeader('Allow', ['GET', 'PATCH', 'DELETE'])
        return res.status(405).json({ message: `Method ${req.method} Not Allowed` })
      }
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    if (message.includes('not found') || message.includes('Not found')) {
      return res.status(404).json({ message })
    }
    console.error('[branch]', message, e)
    return res.status(500).json({ message: message || 'Branch operation failed' })
  }
}
