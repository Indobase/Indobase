import { getAccessToken, useParams } from 'common'
import { useCallback, useState } from 'react'
import { toast } from 'sonner'

import {
  DISCUSS_ROLE_DENIED_CODE,
  isDiscussRoleDeniedMessage,
} from 'lib/api/saas/discuss-launch-shared'

type UseDiscussLaunchOptions = {
  projectRef?: string
}

export type DiscussLaunchResult =
  | { ok: true; url: string; discussTeamKey?: string; discussSpaceKey?: string; role?: string }
  | { ok: false; denied: true; message: string }
  | { ok: false; denied: false; message: string }

export function useDiscussLaunch(options?: UseDiscussLaunchOptions) {
  const params = useParams()
  const ref = options?.projectRef || params.ref
  const [isLaunching, setIsLaunching] = useState(false)

  const launch = useCallback(async (): Promise<DiscussLaunchResult> => {
    if (!ref) {
      const message = 'Project ref is required to open Discuss'
      toast.error(message)
      return { ok: false, denied: false, message }
    }

    setIsLaunching(true)
    try {
      const accessToken = await getAccessToken()
      if (!accessToken) {
        throw new Error('You must be signed in to open Discuss')
      }

      const response = await fetch(`/api/platform/projects/${ref}/discuss/launch`, {
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
          `Failed to open Discuss (${response.status})`
        if (
          response.status === 403 ||
          payload?.code === DISCUSS_ROLE_DENIED_CODE ||
          isDiscussRoleDeniedMessage(message)
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
        discussTeamKey:
          typeof payload.discuss_team_key === 'string' ? payload.discuss_team_key : undefined,
        discussSpaceKey:
          typeof payload.discuss_space_key === 'string' ? payload.discuss_space_key : undefined,
        role: typeof payload.role === 'string' ? payload.role : undefined,
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to open Discuss'
      toast.error(message)
      setIsLaunching(false)
      return { ok: false, denied: false, message }
    }
  }, [ref])

  return { isLaunching, launch, projectRef: ref }
}
