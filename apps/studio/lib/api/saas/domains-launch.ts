import type { JwtPayload } from '@indobaseinc/indobase-js'

import {
  getProductConfig,
  getProductLaunchRedirect,
  type HandoffPayload,
} from './product-handoff'

export {
  DOMAINS_ALLOWED_ROLES,
  DOMAINS_ROLE_DENIED_CODE,
  isDomainsRole,
  isDomainsRoleDeniedMessage,
  type DomainsRole,
} from './domains-launch-shared'

type Claims = JwtPayload & Record<string, unknown>

export type DomainsHandoffPayload = HandoffPayload & { aud: 'indobase-domains' }

export async function getDomainsLaunchRedirect({
  claims,
  ref,
}: {
  claims: Claims
  ref: string
}) {
  return getProductLaunchRedirect('domains', { claims, ref })
}

export function resolveDomainsBaseUrl(): string {
  return getProductConfig('domains').defaultBaseUrl.replace(/\/+$/, '')
}
