import type { JwtPayload } from '@indobaseinc/indobase-js'
import type { NextApiRequest } from 'next'

import { constructHeaders } from 'lib/api/apiHelpers'
import { getProjectSettingsForRef } from 'lib/api/saas/settings'
import { parseProjectRefFromRequest } from 'lib/api/storage-admin'

/** Tenant GoTrue admin/proxy target for platform auth routes (`[ref]`). */
export async function getTenantAuthProxyContext(
  req: Pick<NextApiRequest, 'query'>,
  claims: JwtPayload
) {
  const ref = parseProjectRefFromRequest(req)
  if (!ref) throw new Error('Missing project ref')

  const settings = await getProjectSettingsForRef({ claims, ref })
  if (!settings) throw new Error('Project not found')

  const protocol = (settings.app_config?.protocol || 'https').replace(/:$/, '')
  const endpoint = settings.app_config?.endpoint?.trim()
  if (!endpoint) throw new Error(`Project API URL is missing for ${ref}`)

  const serviceKey = settings.service_api_keys
    ?.find((entry) => entry.tags === 'service_role')
    ?.api_key?.trim()
  if (!serviceKey) throw new Error(`Project service_role key is missing for ${ref}`)

  return { apiOrigin: `${protocol}://${endpoint}`, serviceKey, ref }
}

export function tenantAuthProxyHeaders(serviceKey: string) {
  return constructHeaders({
    'Content-Type': 'application/json',
    Accept: 'application/json',
    Authorization: `Bearer ${serviceKey}`,
  })
}
