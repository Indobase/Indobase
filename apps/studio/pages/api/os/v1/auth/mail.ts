import type { NextApiRequest, NextApiResponse } from 'next'

import apiWrapper from 'lib/api/apiWrapper'
import { requireOsApiSecret } from 'lib/api/saas/os-api-auth'
import {
  getOsProductAuthMail,
  updateOsProductAuthMail,
  type OsProductMailMode,
} from 'lib/api/saas/os-product-auth-mail'
import type { Claims } from 'lib/api/saas/platform'

function claimsFromPayload(payload: Record<string, unknown>): Claims | null {
  const sub =
    typeof payload.gotrue_id === 'string'
      ? payload.gotrue_id
      : typeof payload.gotrueId === 'string'
        ? payload.gotrueId
        : ''
  const email = typeof payload.email === 'string' ? payload.email : ''
  if (!sub) return null
  return { sub, email, role: 'authenticated' } as Claims
}

function workspaceRefFrom(payload: Record<string, unknown>, query: NextApiRequest['query']): string {
  const fromBody =
    typeof payload.workspace_ref === 'string'
      ? payload.workspace_ref.trim()
      : typeof payload.workspaceRef === 'string'
        ? payload.workspaceRef.trim()
        : ''
  if (fromBody) return fromBody
  const q = query.workspace_ref ?? query.workspaceRef
  return typeof q === 'string' ? q.trim() : Array.isArray(q) ? String(q[0] || '').trim() : ''
}

export default (req: NextApiRequest, res: NextApiResponse) => apiWrapper(req, res, handler)

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', ['GET', 'POST'])
    return res.status(405).json({ message: `Method ${req.method} Not Allowed` })
  }

  if (!requireOsApiSecret(req)) {
    return res.status(401).json({ message: 'Unauthorized OS API request' })
  }

  let payload: Record<string, unknown> = {}
  if (req.method === 'POST') {
    payload = (req.body ?? {}) as Record<string, unknown>
    if (typeof payload === 'string') {
      try {
        payload = JSON.parse(payload) as Record<string, unknown>
      } catch {
        payload = {}
      }
    }
  } else {
    payload = {
      gotrue_id: req.query.gotrue_id ?? req.query.gotrueId,
      email: req.query.email,
      workspace_ref: req.query.workspace_ref ?? req.query.workspaceRef,
    }
  }

  const workspaceRef = workspaceRefFrom(payload, req.query)
  const claims = claimsFromPayload(payload)
  if (!workspaceRef) return res.status(400).json({ message: 'workspace_ref required' })
  if (!claims) return res.status(400).json({ message: 'gotrue_id required' })

  try {
    if (req.method === 'GET') {
      const status = await getOsProductAuthMail({ claims, workspaceRef })
      return res.status(200).json({ ok: true, ...status })
    }

    const modeRaw = typeof payload.mode === 'string' ? payload.mode.trim() : ''
    const mode =
      modeRaw === 'indobase' || modeRaw === 'branded' ? (modeRaw as OsProductMailMode) : undefined
    const fromEmail =
      typeof payload.from_email === 'string'
        ? payload.from_email
        : typeof payload.fromEmail === 'string'
          ? payload.fromEmail
          : undefined
    const fromName =
      typeof payload.from_name === 'string'
        ? payload.from_name
        : typeof payload.fromName === 'string'
          ? payload.fromName
          : undefined

    const status = await updateOsProductAuthMail({
      claims,
      workspaceRef,
      mode,
      fromEmail,
      fromName,
    })
    return res.status(200).json({ ok: true, ...status })
  } catch (error) {
    const statusCode =
      error && typeof error === 'object' && 'statusCode' in error
        ? Number((error as { statusCode?: number }).statusCode)
        : 500
    const code =
      error && typeof error === 'object' && 'code' in error
        ? String((error as { code?: string }).code || '')
        : ''
    const message = error instanceof Error ? error.message : 'Could not update login mail'
    return res.status(statusCode >= 400 && statusCode < 600 ? statusCode : 500).json({
      ok: false,
      ...(code ? { code } : {}),
      message,
    })
  }
}
