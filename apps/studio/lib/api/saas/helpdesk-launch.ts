import type { JwtPayload } from '@indobaseinc/indobase-js'

import {
  helpdeskQueueKeyForProjectRef,
  helpdeskTeamKeyForOrgSlug,
} from './helpdesk-launch-shared'
import {
  getProductConfig,
  getProductLaunchRedirect,
  type HandoffPayload,
} from './product-handoff'

export {
  HELPDESK_ALLOWED_ROLES,
  HELPDESK_ROLE_DENIED_CODE,
  helpdeskQueueKeyForProjectRef,
  helpdeskTeamKeyForOrgSlug,
  isHelpdeskRole,
  isHelpdeskRoleDeniedMessage,
  type HelpdeskRole,
} from './helpdesk-launch-shared'

type Claims = JwtPayload & Record<string, unknown>

export type HelpdeskHandoffPayload = HandoffPayload & { aud: 'indobase-helpdesk' }

export async function getHelpdeskLaunchRedirect({
  claims,
  ref,
}: {
  claims: Claims
  ref: string
}) {
  const response = await getProductLaunchRedirect('helpdesk', { claims, ref })
  const map = {
    teamKey: helpdeskTeamKeyForOrgSlug(response.project.organization_slug),
    queueKey: helpdeskQueueKeyForProjectRef(response.project.ref),
  }
  return {
    ...response,
    helpdeskTeamKey: map.teamKey,
    helpdeskQueueKey: map.queueKey,
  }
}

export function resolveHelpdeskBaseUrl(): string {
  return getProductConfig('helpdesk').defaultBaseUrl.replace(/\/+$/, '')
}
