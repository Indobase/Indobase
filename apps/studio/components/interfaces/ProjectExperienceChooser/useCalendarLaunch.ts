import { getAccessToken, useParams } from 'common'
import { useCallback, useState } from 'react'
import { toast } from 'sonner'

import {
  CALENDAR_ROLE_DENIED_CODE,
  isCalendarRoleDeniedMessage,
} from 'lib/api/saas/calendar-launch-shared'

type UseCalendarLaunchOptions = {
  projectRef?: string
}

export type CalendarLaunchResult =
  | {
      ok: true
      url: string
      calendarOrgKey?: string
      calendarProjectUsername?: string
      calendarRole?: string
      role?: string
    }
  | { ok: false; denied: true; message: string }
  | { ok: false; denied: false; message: string }

export function useCalendarLaunch(options?: UseCalendarLaunchOptions) {
  const params = useParams()
  const ref = options?.projectRef || params.ref
  const [isLaunching, setIsLaunching] = useState(false)

  const launch = useCallback(async (): Promise<CalendarLaunchResult> => {
    if (!ref) {
      const message = 'Project ref is required to open Calendar'
      toast.error(message)
      return { ok: false, denied: false, message }
    }

    setIsLaunching(true)
    try {
      const accessToken = await getAccessToken()
      if (!accessToken) {
        throw new Error('You must be signed in to open Calendar')
      }

      const response = await fetch(`/api/platform/projects/${ref}/calendar/launch`, {
        method: 'GET',
        credentials: 'include',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
      })

      const payload = await response.json().catch(() => ({}))
      if (!response.ok || !payload?.url) {
        const message =
          (typeof payload?.message === 'string' && payload.message) ||
          `Failed to open Calendar (${response.status})`
        if (
          response.status === 403 ||
          payload?.code === CALENDAR_ROLE_DENIED_CODE ||
          isCalendarRoleDeniedMessage(message)
        ) {
          setIsLaunching(false)
          return { ok: false, denied: true, message }
        }
        throw new Error(message)
      }

      setIsLaunching(false)
      return {
        ok: true,
        url: payload.url as string,
        calendarOrgKey:
          typeof payload.calendar_org_key === 'string' ? payload.calendar_org_key : undefined,
        calendarProjectUsername:
          typeof payload.calendar_project_username === 'string'
            ? payload.calendar_project_username
            : undefined,
        calendarRole:
          typeof payload.calendar_role === 'string' ? payload.calendar_role : undefined,
        role: typeof payload.role === 'string' ? payload.role : undefined,
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to open Calendar'
      toast.error(message)
      setIsLaunching(false)
      return { ok: false, denied: false, message }
    }
  }, [ref])

  return { isLaunching, launch, projectRef: ref }
}
