import type { NextApiRequest, NextApiResponse } from 'next'

import apiWrapper from 'lib/api/apiWrapper'
import { requireOsApiSecret } from 'lib/api/saas/os-api-auth'
import { consumeOsPromptQuota, getOsPromptQuota } from 'lib/api/saas/os-prompt-quota'
import type { Claims } from 'lib/api/saas/platform'

function claimsFromBody(payload: Record<string, unknown>): Claims | null {
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
  if (req.method === 'GET') {
    payload = {
      gotrue_id: typeof req.query.gotrue_id === 'string' ? req.query.gotrue_id : '',
      email: typeof req.query.email === 'string' ? req.query.email : '',
      workspace_ref: typeof req.query.workspace_ref === 'string' ? req.query.workspace_ref : '',
    }
  } else {
    payload = (req.body ?? {}) as Record<string, unknown>
    if (typeof payload === 'string') {
      try {
        payload = JSON.parse(payload) as Record<string, unknown>
      } catch {
        payload = {}
      }
    }
  }

  const workspaceRef =
    typeof payload.workspace_ref === 'string'
      ? payload.workspace_ref.trim()
      : typeof payload.workspaceRef === 'string'
        ? payload.workspaceRef.trim()
        : ''
  const claims = claimsFromBody(payload)
  if (!claims || !workspaceRef) {
    return res.status(400).json({ message: 'gotrue_id and workspace_ref required' })
  }

  if (claims.sub.startsWith('guest_') || workspaceRef.startsWith('draft_')) {
    return res.status(403).json({
      ok: false,
      code: 'account_required',
      message: 'Create your Indobase account before using agent prompts.',
    })
  }

  try {
    if (req.method === 'GET') {
      const quota = await getOsPromptQuota({ claims, workspaceRef })
      if (!quota) return res.status(404).json({ message: 'Workspace not found' })
      return res.status(200).json({ ok: true, quota })
    }

    const result = await consumeOsPromptQuota({ claims, workspaceRef })
    if ('notFound' in result && result.notFound) {
      return res.status(404).json({ message: 'Workspace not found' })
    }
    if (!result.ok) {
      return res.status(402).json({
        ok: false,
        code: 'prompt_quota_exceeded',
        message: result.message,
        quota: result.quota,
      })
    }
    return res.status(200).json({ ok: true, quota: result.quota })
  } catch (error) {
    return res.status(500).json({
      message: error instanceof Error ? error.message : 'Failed to resolve OS prompt quota',
    })
  }
}
