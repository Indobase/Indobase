import { NextApiRequest, NextApiResponse } from 'next'

import apiWrapper from 'lib/api/apiWrapper'
import type { JwtPayload } from '@supabase/supabase-js'
import { getTenantStackArtifacts } from 'lib/api/self-hosted/platform'

export default (req: NextApiRequest, res: NextApiResponse) =>
  apiWrapper(req, res, handler, { withAuth: true })

const parseRequestBody = (body: NextApiRequest['body']) => {
  if (typeof body !== 'string') return body ?? {}
  try {
    return JSON.parse(body)
  } catch {
    return null
  }
}

async function handler(req: NextApiRequest, res: NextApiResponse, claims?: JwtPayload) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST'])
    return res.status(405).json({ message: `Method ${req.method} Not Allowed` })
  }

  const { ref } = req.query
  if (typeof ref !== 'string' || !ref) return res.status(400).json({ message: 'Project ref is required' })

  const body = parseRequestBody(req.body)
  if (body === null) return res.status(400).json({ message: 'Invalid JSON body' })

  const publicDomain =
    (body && typeof body === 'object' && typeof (body as any).public_domain === 'string'
      ? (body as any).public_domain
      : process.env.PUBLIC_DOMAIN) || ''

  if (!String(publicDomain).trim()) {
    return res.status(400).json({
      message: 'public_domain is required (pass {"public_domain":"example.com"} or set PUBLIC_DOMAIN env)',
    })
  }

  const apply =
    !(body && typeof body === 'object' && 'apply' in body) || Boolean((body as any).apply) === true

  const artifacts = await getTenantStackArtifacts({
    claims: claims as any,
    ref,
    publicDomain: String(publicDomain).trim(),
  })
  if (!artifacts) return res.status(404).json({ message: 'Project not found' })

  const provisionerUrl = process.env.DATA_PLANE_PROVISIONER_URL || ''
  const provisionerToken = process.env.DATA_PLANE_PROVISIONER_TOKEN || ''
  if (!provisionerUrl || !provisionerToken) {
    return res.status(500).json({
      message:
        'DATA_PLANE_PROVISIONER_URL and DATA_PLANE_PROVISIONER_TOKEN must be set on Studio to provision data-plane',
    })
  }

  const r = await fetch(`${provisionerUrl.replace(/\/+$/, '')}/provision`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${provisionerToken}`,
    },
    body: JSON.stringify({
      project_ref: artifacts.project_ref,
      docker_compose_yml: artifacts.docker_compose_yml,
      traefik_yml: artifacts.traefik_yml,
      apply,
    }),
  })

  const text = await r.text()
  let json: any = null
  try {
    json = JSON.parse(text)
  } catch {
    // ignore
  }

  if (!r.ok) {
    return res.status(502).json({
      message: 'Provisioner request failed',
      status: r.status,
      response: json ?? text,
    })
  }

  return res.status(200).json({
    ok: true,
    provisioner: json ?? text,
    artifacts: {
      project_ref: artifacts.project_ref,
      public_domain: artifacts.public_domain,
      data_plane_port_base: artifacts.data_plane_port_base,
      ports: artifacts.ports,
    },
  })
}

