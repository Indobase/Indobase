import { getAccessToken, useParams } from 'common'
import { useCallback, useState } from 'react'
import { toast } from 'sonner'

import {
  DESIGN_ROLE_DENIED_CODE,
  isDesignRoleDeniedMessage,
} from 'lib/api/saas/design-launch-shared'

type UseDesignLaunchOptions = {
  projectRef?: string
}

export type DesignLaunchResult =
  | { ok: true; url: string; role?: string }
  | { ok: false; denied: true; message: string }
  | { ok: false; denied: false; message: string }

export function useDesignLaunch(options?: UseDesignLaunchOptions) {
  const params = useParams()
  const ref = options?.projectRef || params.ref
  const [isLaunching, setIsLaunching] = useState(false)

  const launch = useCallback(async (): Promise<DesignLaunchResult> => {
    if (!ref) {
      const message = 'Project ref is required to open Design'
      toast.error(message)
      return { ok: false, denied: false, message }
    }

    setIsLaunching(true)
    try {
      const accessToken = await getAccessToken()
      if (!accessToken) {
        throw new Error('You must be signed in to open Design')
      }

      const response = await fetch(`/api/platform/projects/${ref}/design/launch`, {
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
          `Failed to open Design (${response.status})`
        if (
          response.status === 403 ||
          payload?.code === DESIGN_ROLE_DENIED_CODE ||
          isDesignRoleDeniedMessage(message)
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
      const message = error instanceof Error ? error.message : 'Failed to open Design'
      toast.error(message)
      setIsLaunching(false)
      return { ok: false, denied: false, message }
    }
  }, [ref])

  return { isLaunching, launch, projectRef: ref }
}
