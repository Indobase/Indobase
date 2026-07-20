import { getAccessToken, hasConsented, isPostHogConfigured, posthogClient, useParams } from 'common'
import { useCallback, useState } from 'react'
import { toast } from 'sonner'

type UseBuilderLaunchOptions = {
  connectFlow?: boolean
  nextPath?: string
  projectRef?: string
}

export function useBuilderLaunch(options?: UseBuilderLaunchOptions) {
  const params = useParams()
  const ref = options?.projectRef || params.ref
  const [isLaunching, setIsLaunching] = useState(false)

  const launch = useCallback(async () => {
    if (!ref) {
      toast.error('Project ref is required to open Builder')
      return false
    }

    // Open synchronously to avoid popup blockers; noopener is set after open.
    const newTab = window.open('about:blank', '_blank')
    if (newTab) {
      newTab.opener = null
    }

    setIsLaunching(true)
    try {
      const qs = new URLSearchParams()
      if (options?.nextPath) qs.set('next', options.nextPath)
      if (options?.connectFlow) qs.set('connect', '1')
      const suffix = qs.toString() ? `?${qs.toString()}` : ''
      const accessToken = await getAccessToken()
      if (!accessToken) {
        throw new Error('You must be signed in to open Builder')
      }

      const response = await fetch(`/api/platform/projects/${ref}/builder/launch${suffix}`, {
        method: 'GET',
        credentials: 'include',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
      })

      const payload = await response.json().catch(() => ({}))
      if (!response.ok || !payload?.url) {
        throw new Error(payload?.message || `Failed to open Builder (${response.status})`)
      }

      if (newTab) {
        newTab.location.href = payload.url
      } else {
        toast.error('Popup blocked. Opening Builder in the current tab instead.')
        window.location.href = payload.url
      }

      if (hasConsented() && isPostHogConfigured()) {
        posthogClient.capture('builder_handoff_launched', {
          connect_flow: Boolean(options?.connectFlow),
          project_ref: ref,
        })
      }

      setIsLaunching(false)
      return true
    } catch (error) {
      try {
        newTab?.close()
      } catch {
        // ignore
      }
      toast.error(error instanceof Error ? error.message : 'Failed to open Builder')
      setIsLaunching(false)
      return false
    }
  }, [options?.connectFlow, options?.nextPath, ref])

  return { isLaunching, launch, projectRef: ref }
}
