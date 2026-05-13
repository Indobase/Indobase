import { NextApiRequest, NextApiResponse } from 'next'

import apiWrapper from 'lib/api/apiWrapper'
import type { JwtPayload } from 'indobase-js'
import { listOrganizations } from 'lib/api/saas/platform'

const proxyTarget = process.env.PLATFORM_API_PROXY

function isProxyLoopback(req: NextApiRequest, target: string) {
  try {
    const parsed = new URL(target)
    const requestHost = req.headers.host
    return !!requestHost && parsed.host === requestHost
  } catch {
    return false
  }
}

const proxyRequest = async (req: NextApiRequest, res: NextApiResponse) => {
  if (!proxyTarget) return false
  if (isProxyLoopback(req, proxyTarget)) {
    res.status(500).json({
      message:
        'PLATFORM_API_PROXY appears to point back to this Studio host (would recurse). Please set it to the external Platform API base URL (no trailing /api).',
    })
    return true
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
  return true
}

export default (req: NextApiRequest, res: NextApiResponse) =>
  apiWrapper(req, res, handler, { withAuth: true })

async function handler(req: NextApiRequest, res: NextApiResponse, claims?: JwtPayload) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET'])
    return res.status(405).json({ message: `Method ${req.method} Not Allowed` })
  }

  if (await proxyRequest(req, res)) return

  // Self-hosted SaaS: grant full org-level access on every org the caller belongs to.
  // Per-project checks fall back to the org-level entry via doPermissionsCheck.
  const orgs = await listOrganizations({ claims: claims as any })
  const permissions = (orgs ?? []).map((o) => ({
    actions: ['%'],
    resources: ['%'],
    condition: null,
    organization_slug: o.slug,
    project_refs: [],
    restrictive: false,
  }))
  return res.status(200).json(permissions)
}
