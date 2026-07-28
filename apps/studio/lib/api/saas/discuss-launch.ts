import type { JwtPayload } from '@indobaseinc/indobase-js'

import {
  discussSpaceKeyForProjectRef,
  discussTeamKeyForOrgSlug,
} from './discuss-launch-shared'
import {
  getProductConfig,
  getProductLaunchRedirect,
  type HandoffPayload,
} from './product-handoff'

export {
  DISCUSS_ALLOWED_ROLES,
  DISCUSS_ROLE_DENIED_CODE,
  discussSpaceKeyForProjectRef,
  discussTeamKeyForOrgSlug,
  isDiscussRole,
  isDiscussRoleDeniedMessage,
  type DiscussRole,
} from './discuss-launch-shared'

type Claims = JwtPayload & Record<string, unknown>

export type DiscussHandoffPayload = HandoffPayload & { aud: 'indobase-discuss' }

export async function getDiscussLaunchRedirect({
  claims,
  ref,
}: {
  claims: Claims
  ref: string
}) {
  const response = await getProductLaunchRedirect('discuss', { claims, ref })
  const map = {
    teamKey: discussTeamKeyForOrgSlug(response.project.organization_slug),
    spaceKey: discussSpaceKeyForProjectRef(response.project.ref),
  }
  return {
    ...response,
    discussTeamKey: map.teamKey,
    discussSpaceKey: map.spaceKey,
  }
}

export function resolveDiscussBaseUrl(): string {
  return getProductConfig('discuss').defaultBaseUrl.replace(/\/+$/, '')
}
