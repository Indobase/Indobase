import type { JwtPayload } from '@indobaseinc/indobase-js'

import {
  crmPipelineKeyForProjectRef,
  crmTeamKeyForOrgSlug,
} from './crm-launch-shared'
import {
  getProductConfig,
  getProductLaunchRedirect,
  type HandoffPayload,
} from './product-handoff'

export {
  CRM_ALLOWED_ROLES,
  CRM_ROLE_DENIED_CODE,
  crmPipelineKeyForProjectRef,
  crmTeamKeyForOrgSlug,
  isCrmRole,
  isCrmRoleDeniedMessage,
  type CrmRole,
} from './crm-launch-shared'

type Claims = JwtPayload & Record<string, unknown>

export type CrmHandoffPayload = HandoffPayload & { aud: 'indobase-crm' }

export async function getCrmLaunchRedirect({
  claims,
  ref,
}: {
  claims: Claims
  ref: string
}) {
  const response = await getProductLaunchRedirect('crm', { claims, ref })
  const map = {
    teamKey: crmTeamKeyForOrgSlug(response.project.organization_slug),
    pipelineKey: crmPipelineKeyForProjectRef(response.project.ref),
  }
  return {
    ...response,
    crmTeamKey: map.teamKey,
    crmPipelineKey: map.pipelineKey,
  }
}

export function resolveCrmBaseUrl(): string {
  return getProductConfig('crm').defaultBaseUrl.replace(/\/+$/, '')
}
