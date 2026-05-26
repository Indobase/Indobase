import { useParams } from 'common'
import { Button, type ButtonProps } from 'ui'
import { useState } from 'react'
import { toast } from 'sonner'

type BuilderLaunchButtonProps = Omit<ButtonProps, 'onClick' | 'loading'> & {
  projectRef?: string
}

export const BuilderLaunchButton = ({
  projectRef,
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

    setIsLaunching(true)
    try {
      const response = await fetch(`/api/platform/projects/${ref}/builder/launch`, {
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
      window.location.href = payload.url
    } catch (error) {
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
