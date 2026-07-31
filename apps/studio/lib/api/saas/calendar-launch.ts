import type { JwtPayload } from '@indobaseinc/indobase-js'

import {
  calendarOrgKeyForOrgSlug,
  calendarProductRoleFromStudio,
  calendarProjectUsernameForRef,
} from './calendar-launch-shared'
import {
  getProductConfig,
  getProductLaunchRedirect,
  type HandoffPayload,
} from './product-handoff'

export {
  CALENDAR_ALLOWED_ROLES,
  CALENDAR_ROLE_DENIED_CODE,
  calendarOrgKeyForOrgSlug,
  calendarProductRoleFromStudio,
  calendarProjectUsernameForRef,
  isCalendarRole,
  isCalendarRoleDeniedMessage,
  type CalendarRole,
} from './calendar-launch-shared'

type Claims = JwtPayload & Record<string, unknown>

export type CalendarHandoffPayload = HandoffPayload & { aud: 'indobase-calendar' }

export async function getCalendarLaunchRedirect({
  claims,
  ref,
}: {
  claims: Claims
  ref: string
}) {
  const response = await getProductLaunchRedirect('calendar', { claims, ref })
  return {
    ...response,
    calendarOrgKey: calendarOrgKeyForOrgSlug(response.project.organization_slug),
    calendarProjectUsername: calendarProjectUsernameForRef(response.project.ref),
    calendarRole: calendarProductRoleFromStudio(response.role),
  }
}

export function resolveCalendarBaseUrl(): string {
  return (
    process.env.INDOBASE_CALENDAR_URL?.trim() ||
    process.env.NEXT_PUBLIC_INDOBASE_CALENDAR_URL?.trim() ||
    getProductConfig('calendar').defaultBaseUrl
  ).replace(/\/+$/, '')
}
