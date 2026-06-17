import { NextApiRequest, NextApiResponse } from 'next'

import type { JwtPayload } from '@indobaseinc/indobase-js'

import apiWrapper from 'lib/api/apiWrapper'
import { acceptOrganizationInvite } from 'lib/api/saas/platform'
import { executeQuery } from 'lib/api/saas/query'

export default (req: NextApiRequest, res: NextApiResponse) =>
  apiWrapper(req, res, handler, { withAuth: true })

async function handler(req: NextApiRequest, res: NextApiResponse, claims?: JwtPayload) {
  const { method } = req
  const { slug, token } = req.query

  if (typeof slug !== 'string' || !slug) return res.status(400).json({ message: 'Organization slug is required' })
  if (typeof token !== 'string' || !token) return res.status(400).json({ message: 'Invitation token is required' })

  switch (method) {
    case 'GET':
      return handleGet(res, claims, slug, token)
    case 'POST':
      return handlePost(res, claims, token)
    default:
      res.setHeader('Allow', ['GET', 'POST'])
      return res.status(405).json({ message: `Method ${method} Not Allowed` })
  }
}

async function handleGet(res: NextApiResponse, claims: JwtPayload | undefined, slug: string, token: string) {
  const email =
    (claims as any)?.email ??
    (claims as any)?.user_metadata?.email ??
    (claims as any)?.claims?.email ??
    ''
  const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : ''

  const row = await executeQuery<{
    token: string
    email: string
    accepted_at: string | null
    organization_name: string
    organization_slug: string
    invite_id: number
  }>({
    query: `
      select
        i.token,
        i.email,
        i.accepted_at,
        o.name as organization_name,
        o.slug as organization_slug,
        i.id as invite_id
      from saas.organization_invites i
      join saas.organizations o on o.id = i.organization_id
      where o.slug = $1 and i.token = $2
      limit 1
    `,
    parameters: [slug, token],
  })

  if (row.error) throw row.error

  if (!row.data?.length) {
    return res.status(200).json({
      authorized_user: true,
      email_match: false,
      expired_token: false,
      organization_name: 'An organization',
      sso_mismatch: false,
      token_does_not_exist: true,
    })
  }

  const invite = row.data[0]
  const emailMatch = normalizedEmail && invite.email.trim().toLowerCase() === normalizedEmail
  const expired = Boolean(invite.accepted_at)

  return res.status(200).json({
    authorized_user: true,
    email_match: Boolean(emailMatch),
    expired_token: expired,
    invite_id: invite.invite_id,
    organization_name: invite.organization_name,
    sso_mismatch: false,
    token_does_not_exist: false,
  })
}

async function handlePost(res: NextApiResponse, claims: JwtPayload | undefined, token: string) {
  await acceptOrganizationInvite({ claims: claims as any, token })
  return res.status(200).json({ ok: true })
}

