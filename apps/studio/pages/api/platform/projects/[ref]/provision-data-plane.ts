import type { JwtPayload } from 'indobase-js'
import type { NextApiRequest, NextApiResponse } from 'next'

import apiWrapper from 'lib/api/apiWrapper'
import { setNoStore } from 'lib/api/no-store'
import { getTenantStackArtifacts, recordDataPlaneProvisionSuccess, resolvePublicDomainForTenantStack } from 'lib/api/saas/platform'

export default (req: NextApiRequest, res: NextApiResponse) =>
  apiWrapper(req, res, handler, { withAuth: true })

async function handler(req: NextApiRequest, res: NextApiResponse, claims?: JwtPayload) {
  setNoStore(res)
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST'])
    return res.status(405).json({ message: 'Method not allowed' })
  }

  const ref = typeof req.query.ref === 'string' ? req.query.ref : ''
  if (!ref) return res.status(400).json({ message: 'Project ref is required' })

  const provisionerUrl = (process.env.DATA_PLANE_PROVISIONER_URL || '').trim().replace(/\/$/, '')
  const provisionerToken = (process.env.DATA_PLANE_PROVISIONER_TOKEN || '').trim()
  if (!provisionerUrl || !provisionerToken) {
    return res.status(503).json({
      message:
        'Data-plane provisioner is not configured. Set DATA_PLANE_PROVISIONER_URL and DATA_PLANE_PROVISIONER_TOKEN on the Studio service.',
    })
  }

  if (!claims) return res.status(401).json({ message: 'Unauthorized' })

  let apply = true
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body ?? {}
    if (body && typeof body === 'object' && body.apply === false) apply = false
  } catch {
    return res.status(400).json({ message: 'Invalid JSON body' })
  }

  const publicDomain = resolvePublicDomainForTenantStack()
  const artifacts = await getTenantStackArtifacts({ claims, ref, publicDomain })
  if (!artifacts) {
    return res.status(404).json({
      message:
        'No dedicated tenant database for this project. Per-project stacks apply when each project has its own DB (SAAS_DEDICATED_DATABASE_ON_PROJECT_CREATE, default on).',
    })
  }

  const resp = await fetch(`${provisionerUrl}/provision`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${provisionerToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      project_ref: ref,
      docker_compose_yml: artifacts.docker_compose_yml,
      traefik_yml: artifacts.traefik_yml,
      apply,
    }),
  })

  const text = await resp.text()
  let parsed: unknown
  try {
    parsed = text ? JSON.parse(text) : {}
  } catch {
    parsed = { raw: text }
  }

  if (!resp.ok) {
    return res.status(resp.status >= 400 ? resp.status : 502).json({
      message: 'Provisioner request failed',
      provisioner_status: resp.status,
      provisioner_body: parsed,
    })
  }

  const extra = typeof parsed === 'object' && parsed !== null ? parsed : {}
  try {
    await recordDataPlaneProvisionSuccess({
      claims,
      ref,
      provisionResult: {
        ok: true,
        apply,
        provisioner_status: resp.status,
        ...(extra as Record<string, unknown>),
      },
    })
  } catch (e) {
    console.warn('[provision-data-plane] failed to persist provision metadata: %O', e)
  }
  return res.status(200).json({ ok: true, apply, ...extra })
}
