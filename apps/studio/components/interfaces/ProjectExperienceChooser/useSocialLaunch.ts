import { getAccessToken, useParams } from 'common'
import { useCallback, useState } from 'react'
import { toast } from 'sonner'

import {
  SOCIAL_ROLE_DENIED_CODE,
  isSocialRoleDeniedMessage,
} from 'lib/api/saas/social-launch-shared'

type UseSocialLaunchOptions = {
  projectRef?: string
}

export type SocialLaunchResult =
  | { ok: true; url: string; socialOrgName?: string; role?: string }
  | { ok: false; denied: true; message: string }
  | { ok: false; denied: false; message: string }

export function useSocialLaunch(options?: UseSocialLaunchOptions) {
  const params = useParams()
  const ref = options?.projectRef || params.ref
  const [isLaunching, setIsLaunching] = useState(false)

  const launch = useCallback(async (): Promise<SocialLaunchResult> => {
    if (!ref) {
      const message = 'Project ref is required to open Social'
      toast.error(message)
      return { ok: false, denied: false, message }
    }

    setIsLaunching(true)
    try {
      const accessToken = await getAccessToken()
      if (!accessToken) {
        throw new Error('You must be signed in to open Social')
      }

      const response = await fetch(`/api/platform/projects/${ref}/social/launch`, {
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
          `Failed to open Social (${response.status})`
        if (
          response.status === 403 ||
          payload?.code === SOCIAL_ROLE_DENIED_CODE ||
          isSocialRoleDeniedMessage(message)
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
        socialOrgName:
          typeof payload.social_org_name === 'string' ? payload.social_org_name : undefined,
        role: typeof payload.role === 'string' ? payload.role : undefined,
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to open Social'
      toast.error(message)
      setIsLaunching(false)
      return { ok: false, denied: false, message }
    }
  }, [ref])

  return { isLaunching, launch, projectRef: ref }
}
