import type { JwtPayload } from '@indobaseinc/indobase-js'

import {
  meetMeetingIdForProjectRef,
  meetOrgKeyForOrgSlug,
  meetRoleFromStudio,
  type MeetStudioRole,
} from './meet-launch-shared'
import {
  getProductConfig,
  getProductLaunchRedirect,
  type HandoffPayload,
} from './product-handoff'

export {
  MEET_ALLOWED_ROLES,
  MEET_ROLE_DENIED_CODE,
  meetMeetingIdForProjectRef,
  meetOrgKeyForOrgSlug,
  meetRoleFromStudio,
  isMeetStudioRole,
  isMeetRoleDeniedMessage,
  type MeetStudioRole,
  type MeetProductRole,
} from './meet-launch-shared'

type Claims = JwtPayload & Record<string, unknown>

export type MeetHandoffPayload = HandoffPayload & { aud: 'indobase-meet' }

export async function getMeetLaunchRedirect({
  claims,
  ref,
}: {
  claims: Claims
  ref: string
}) {
  const response = await getProductLaunchRedirect('meet', { claims, ref })
  const map = {
    orgKey: meetOrgKeyForOrgSlug(response.project.organization_slug),
    meetingId: meetMeetingIdForProjectRef(response.project.ref),
  }
  const roleMap = meetRoleFromStudio(response.role as MeetStudioRole)
  return {
    ...response,
    meetOrgKey: map.orgKey,
    meetMeetingId: map.meetingId,
    meetRole: roleMap.meetRole,
    isModerator: roleMap.isModerator,
  }
}

export function resolveMeetBaseUrl(): string {
  return getProductConfig('meet').defaultBaseUrl.replace(/\/+$/, '')
}
