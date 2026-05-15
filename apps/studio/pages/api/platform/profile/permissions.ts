import { NextApiRequest, NextApiResponse } from 'next'
import { PermissionAction } from '@supabase/shared-types/out/constants'
import type { JwtPayload } from 'indobase-js'

import apiWrapper from 'lib/api/apiWrapper'
import { listOrganizationsWithRoles } from 'lib/api/saas/platform'
import type { Permission } from 'types'

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
  // Prevent infinite recursion if PLATFORM_API_PROXY points back to Studio itself.
  if (isProxyLoopback(req, proxyTarget)) return false
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

  // Self-hosted SaaS: role-based permissions from saas.organization_members.
  // viewer → read-only; owner / admin / developer → full org/project access (wildcard).
  const memberships = await listOrganizationsWithRoles({ claims: claims as any })
  const permissions: Permission[] = memberships.map(({ slug, role }) => {
    if (role === 'viewer') {
      return {
        actions: [PermissionAction.READ],
        resources: ['%'],
        condition: null,
        organization_slug: slug,
        project_refs: [],
        restrictive: false,
      }
    }
    return {
      actions: ['%' as unknown as PermissionAction],
      resources: ['%'],
      condition: null,
      organization_slug: slug,
      project_refs: [],
      restrictive: false,
    }
  })
  return res.status(200).json(permissions)
}
