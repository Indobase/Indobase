import { useParams } from 'common'
import { Button, type ButtonProps } from 'ui'
import { useState } from 'react'
import { toast } from 'sonner'

type BuilderLaunchButtonProps = Omit<ButtonProps, 'onClick' | 'loading'> & {
  projectRef?: string
  nextPath?: string
}

export const BuilderLaunchButton = ({
  projectRef,
  nextPath,
  children,
  ...props
}: BuilderLaunchButtonProps) => {
  const params = useParams()
  const ref = projectRef || params.ref
  const [isLaunching, setIsLaunching] = useState(false)

  const onLaunch = async () => {
    if (!ref) {
      toast.error('Project ref is required to open Builder')
      return
    }

    // Open a new tab synchronously to avoid popup blockers.
    // We'll navigate it once the signed launch URL is fetched.
    const newTab = window.open('about:blank', '_blank', 'noopener,noreferrer')

    setIsLaunching(true)
    try {
      const qs = new URLSearchParams()
      if (nextPath) qs.set('next', nextPath)
      const suffix = qs.toString() ? `?${qs.toString()}` : ''
      const response = await fetch(`/api/platform/projects/${ref}/builder/launch${suffix}`, {
        method: 'GET',
        credentials: 'include',
        headers: {
          Accept: 'application/json',
        },
      })

      const payload = await response.json().catch(() => ({}))
      if (!response.ok || !payload?.url) {
        throw new Error(payload?.message || `Failed to open Builder (${response.status})`)
      }

      // Builder receives a signed handoff token whose payload now includes the
      // selected project's public backend config (project URL + anon key + API URL).
      if (newTab) {
        newTab.location.href = payload.url
      } else {
        toast.error('Popup blocked. Opening Builder in the current tab instead.')
        window.location.href = payload.url
      }
    } catch (error) {
      try {
        newTab?.close()
      } catch {
        // ignore
      }
      toast.error(error instanceof Error ? error.message : 'Failed to open Builder')
      setIsLaunching(false)
    }
  }

  return (
    <Button {...props} loading={isLaunching} onClick={() => void onLaunch()}>
      {children}
    </Button>
  )
}
