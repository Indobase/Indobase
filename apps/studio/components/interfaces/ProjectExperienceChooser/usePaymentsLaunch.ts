import { getAccessToken, useParams } from 'common'
import { useCallback, useState } from 'react'
import { toast } from 'sonner'

type UsePaymentsLaunchOptions = {
  projectRef?: string
}

export function usePaymentsLaunch(options?: UsePaymentsLaunchOptions) {
  const params = useParams()
  const ref = options?.projectRef || params.ref
  const [isLaunching, setIsLaunching] = useState(false)

  const launch = useCallback(async (): Promise<string | null> => {
    if (!ref) {
      toast.error('Project ref is required to open Payments')
      return null
    }

    setIsLaunching(true)
    try {
      const accessToken = await getAccessToken()
      if (!accessToken) {
        throw new Error('You must be signed in to open Payments')
      }

      const response = await fetch(`/api/platform/projects/${ref}/payments/launch`, {
        method: 'GET',
        credentials: 'include',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
      })

      const payload = await response.json().catch(() => ({}))
      if (!response.ok || !payload?.url) {
        throw new Error(payload?.message || `Failed to open Payments (${response.status})`)
      }

      setIsLaunching(false)
      return payload.url as string
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to open Payments')
      setIsLaunching(false)
      return null
    }
  }, [ref])

  return { isLaunching, launch, projectRef: ref }
}
