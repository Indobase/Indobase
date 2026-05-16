import type { JwtPayload } from 'indobase-js'
import type { NextApiRequest, NextApiResponse } from 'next'

import apiWrapper from 'lib/api/apiWrapper'
import { setNoStore } from 'lib/api/no-store'
import { executeQuery } from 'lib/api/saas/query'
import { runTenantDataPlaneBootstrapFromConnectionString } from 'lib/api/saas/provision-tenant-db'
import { ensureTenantGoTrueAuthSchema } from 'lib/api/saas/tenant-gotrue-schema'
import { decryptString } from 'lib/api/saas/util'

export default (req: NextApiRequest, res: NextApiResponse) =>
  apiWrapper(req, res, handler, { withAuth: true })

/**
 * Idempotent SQL bootstrap for dedicated tenant DBs created before auxiliary roles
 * (authenticator, supabase_*) existed. Requires a decryptable per-project connection string.
 */
async function handler(req: NextApiRequest, res: NextApiResponse, claims?: JwtPayload) {
  setNoStore(res)
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST'])
    return res.status(405).json({ message: 'Method not allowed' })
  }

  const ref = typeof req.query.ref === 'string' ? req.query.ref : ''
  if (!ref) return res.status(400).json({ message: 'Project ref is required' })
  if (!claims) return res.status(401).json({ message: 'Unauthorized' })

  const normalizedClaims: any =
    claims && typeof (claims as any).claims === 'object' ? (claims as any).claims : claims
  const gotrueId: string | undefined = normalizedClaims?.sub
  if (!gotrueId) return res.status(401).json({ message: 'Missing user session' })

  const row = await executeQuery<{
    connection_string: string | null
    connection_string_enc: string | null
  }>({
    query: `
      select p.connection_string, p.connection_string_enc
      from saas.projects p
      join saas.organization_members m on m.organization_id = p.organization_id
      where p.ref = $1
        and m.gotrue_id = $2
        and m.role in ('owner', 'admin', 'developer')
      limit 1
    `,
    parameters: [ref, gotrueId],
    actorId: gotrueId,
  })
  if (row.error) return res.status(500).json({ message: row.error.message })
  if (!row.data?.length) return res.status(404).json({ message: 'Project not found' })

  const p = row.data[0]!
  const enc = (p.connection_string_enc ?? '').trim()
  const url = enc.length > 0 ? decryptString(enc) : p.connection_string
  if (!url?.trim()) {
    return res.status(404).json({
      message:
        'No dedicated tenant database URL on this project; backfill applies only to per-project DB mode.',
    })
  }

  try {
    const result = await runTenantDataPlaneBootstrapFromConnectionString(url.trim())
    let authSchema: Awaited<ReturnType<typeof ensureTenantGoTrueAuthSchema>> | null = null
    try {
      authSchema = await ensureTenantGoTrueAuthSchema({ claims, ref })
    } catch (authErr) {
      console.warn('[backfill-tenant-data-plane-db] auth schema ensure failed for %s: %O', ref, authErr)
    }
    return res.status(200).json({ ok: true, ...result, auth_schema: authSchema })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return res.status(500).json({ message })
  }
}
