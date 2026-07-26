import { getAccessToken, useParams } from 'common'
import { useCallback, useState } from 'react'
import { toast } from 'sonner'

import {
  VIDEO_ROLE_DENIED_CODE,
  isVideoRoleDeniedMessage,
} from 'lib/api/saas/video-launch-shared'

type UseVideoLaunchOptions = {
  projectRef?: string
}

export type VideoLaunchResult =
  | { ok: true; url: string; role?: string }
  | { ok: false; denied: true; message: string }
  | { ok: false; denied: false; message: string }

export function useVideoLaunch(options?: UseVideoLaunchOptions) {
  const params = useParams()
  const ref = options?.projectRef || params.ref
  const [isLaunching, setIsLaunching] = useState(false)

  const launch = useCallback(async (): Promise<VideoLaunchResult> => {
    if (!ref) {
      const message = 'Project ref is required to open Video'
      toast.error(message)
      return { ok: false, denied: false, message }
    }

    setIsLaunching(true)
    try {
      const accessToken = await getAccessToken()
      if (!accessToken) {
        throw new Error('You must be signed in to open Video')
      }

      const response = await fetch(`/api/platform/projects/${ref}/video/launch`, {
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
          `Failed to open Video (${response.status})`
        if (
          response.status === 403 ||
          payload?.code === VIDEO_ROLE_DENIED_CODE ||
          isVideoRoleDeniedMessage(message)
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
        role: typeof payload.role === 'string' ? payload.role : undefined,
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to open Video'
      toast.error(message)
      setIsLaunching(false)
      return { ok: false, denied: false, message }
    }
  }, [ref])

  return { isLaunching, launch, projectRef: ref }
}
