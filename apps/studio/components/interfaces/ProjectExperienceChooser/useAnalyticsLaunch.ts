import { getAccessToken, useParams } from 'common'
import { useCallback, useState } from 'react'
import { toast } from 'sonner'

import {
  ANALYTICS_ROLE_DENIED_CODE,
  isAnalyticsRoleDeniedMessage,
} from 'lib/api/saas/analytics-launch-shared'

type UseAnalyticsLaunchOptions = {
  projectRef?: string
}

export type AnalyticsMapping = {
  project_ref: string
  project_name: string
  site_domain: string
  analytics_base_url: string
  snippet: string
  note?: string
}

export type AnalyticsLaunchResult =
  | { ok: true; url: string; role?: string; mapping?: AnalyticsMapping }
  | { ok: false; denied: true; message: string }
  | { ok: false; denied: false; message: string }

export function useAnalyticsLaunch(options?: UseAnalyticsLaunchOptions) {
  const params = useParams()
  const ref = options?.projectRef || params.ref
  const [isLaunching, setIsLaunching] = useState(false)

  const launch = useCallback(async (): Promise<AnalyticsLaunchResult> => {
    if (!ref) {
      const message = 'Project ref is required to open Analytics'
      toast.error(message)
      return { ok: false, denied: false, message }
    }

    setIsLaunching(true)
    try {
      const accessToken = await getAccessToken()
      if (!accessToken) {
        throw new Error('You must be signed in to open Analytics')
      }

      const response = await fetch(`/api/platform/projects/${ref}/analytics/launch`, {
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
          `Failed to open Analytics (${response.status})`
        if (
          response.status === 403 ||
          payload?.code === ANALYTICS_ROLE_DENIED_CODE ||
          isAnalyticsRoleDeniedMessage(message)
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
        mapping: payload.mapping as AnalyticsMapping | undefined,
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to open Analytics'
      toast.error(message)
      setIsLaunching(false)
      return { ok: false, denied: false, message }
    }
  }, [ref])

  return { isLaunching, launch, projectRef: ref }
}
