import { getAccessToken, useParams } from 'common'
import { useCallback, useState } from 'react'
import { toast } from 'sonner'

import {
  HELPDESK_ROLE_DENIED_CODE,
  isHelpdeskRoleDeniedMessage,
} from 'lib/api/saas/helpdesk-launch-shared'

type UseHelpdeskLaunchOptions = {
  projectRef?: string
}

export type HelpdeskLaunchResult =
  | { ok: true; url: string; helpdeskTeamKey?: string; helpdeskQueueKey?: string; role?: string }
  | { ok: false; denied: true; message: string }
  | { ok: false; denied: false; message: string }

export function useHelpdeskLaunch(options?: UseHelpdeskLaunchOptions) {
  const params = useParams()
  const ref = options?.projectRef || params.ref
  const [isLaunching, setIsLaunching] = useState(false)

  const launch = useCallback(async (): Promise<HelpdeskLaunchResult> => {
    if (!ref) {
      const message = 'Project ref is required to open Helpdesk'
      toast.error(message)
      return { ok: false, denied: false, message }
    }

    setIsLaunching(true)
    try {
      const accessToken = await getAccessToken()
      if (!accessToken) {
        throw new Error('You must be signed in to open Helpdesk')
      }

      const response = await fetch(`/api/platform/projects/${ref}/helpdesk/launch`, {
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
          `Failed to open Helpdesk (${response.status})`
        if (
          response.status === 403 ||
          payload?.code === HELPDESK_ROLE_DENIED_CODE ||
          isHelpdeskRoleDeniedMessage(message)
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
        helpdeskTeamKey:
          typeof payload.helpdesk_team_key === 'string' ? payload.helpdesk_team_key : undefined,
        helpdeskQueueKey:
          typeof payload.helpdesk_queue_key === 'string' ? payload.helpdesk_queue_key : undefined,
        role: typeof payload.role === 'string' ? payload.role : undefined,
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to open Helpdesk'
      toast.error(message)
      setIsLaunching(false)
      return { ok: false, denied: false, message }
    }
  }, [ref])

  return { isLaunching, launch, projectRef: ref }
}
