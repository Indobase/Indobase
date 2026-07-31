import { useCallback, useState } from 'react'

import { getAccessToken, useParams } from 'common'
import {
  MEET_ROLE_DENIED_CODE,
  isMeetRoleDeniedMessage,
} from 'lib/api/saas/meet-launch-shared'

type UseMeetLaunchOptions = {
  onError?: (message: string) => void
}

export type MeetLaunchResult =
  | {
      ok: true
      url: string
      meetOrgKey?: string
      meetMeetingId?: string
      meetRole?: string
      role?: string
    }
  | { ok: false; message: string; code?: string }

export function useMeetLaunch(options?: UseMeetLaunchOptions) {
  const { ref } = useParams()
  const [isLaunching, setIsLaunching] = useState(false)

  const launch = useCallback(async (): Promise<MeetLaunchResult> => {
    if (!ref) {
      const message = 'Project ref is required to open Meet'
      options?.onError?.(message)
      return { ok: false, message }
    }

    setIsLaunching(true)
    try {
      const accessToken = await getAccessToken()
      if (!accessToken) {
        throw new Error('You must be signed in to open Meet')
      }

      const response = await fetch(`/api/platform/projects/${ref}/meet/launch`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      })

      const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>
      if (!response.ok) {
        const message =
          (typeof payload.message === 'string' && payload.message) ||
          `Failed to open Meet (${response.status})`
        const code = typeof payload.code === 'string' ? payload.code : undefined
        if (code === MEET_ROLE_DENIED_CODE || isMeetRoleDeniedMessage(message)) {
          options?.onError?.(message)
          return { ok: false, message, code: MEET_ROLE_DENIED_CODE }
        }
        options?.onError?.(message)
        return { ok: false, message, code }
      }

      const url = typeof payload.url === 'string' ? payload.url : ''
      if (!url) {
        const message = 'Meet launch URL missing'
        options?.onError?.(message)
        return { ok: false, message }
      }

      return {
        ok: true,
        url,
        meetOrgKey: typeof payload.meet_org_key === 'string' ? payload.meet_org_key : undefined,
        meetMeetingId:
          typeof payload.meet_meeting_id === 'string' ? payload.meet_meeting_id : undefined,
        meetRole: typeof payload.meet_role === 'string' ? payload.meet_role : undefined,
        role: typeof payload.role === 'string' ? payload.role : undefined,
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to open Meet'
      options?.onError?.(message)
      return { ok: false, message }
    } finally {
      setIsLaunching(false)
    }
  }, [options, ref])

  return { isLaunching, launch }
}
