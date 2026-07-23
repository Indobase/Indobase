import { Button } from '@md/ui'
import { useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'

import { env } from '@/lib/env'

/**
 * Operators authenticate via Studio only. Password / Meteroid signup is not the primary path.
 */
export const Login = (): JSX.Element => {
  const [searchParams] = useSearchParams()
  const error = searchParams.get('error')
  const projectRef = searchParams.get('project_ref')
  const returnUrl = searchParams.get('returnUrl')

  useEffect(() => {
    if (!error) return
    const t = window.setTimeout(() => {
      toast.error(error, { id: 'login_url_error' })
    }, 1)
    return () => window.clearTimeout(t)
  }, [error])

  const studioSignIn = () => {
    const studio = env.studioUrl.replace(/\/+$/, '')
    const returnPath =
      returnUrl && returnUrl.startsWith('/')
        ? returnUrl
        : projectRef
          ? `/project/${encodeURIComponent(projectRef)}/payments`
          : '/'
    window.location.assign(`${studio}/sign-in?returnTo=${encodeURIComponent(returnPath)}`)
  }

  // Direct visits without a Studio session: send them to Studio immediately.
  useEffect(() => {
    if (error) return
    const fromStudio = searchParams.get('from') === 'studio'
    // If they landed here after a failed handoff (`error`), stay and show CTA.
    // Otherwise bounce to Studio sign-in.
    if (!fromStudio) {
      studioSignIn()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="flex flex-col gap-4">
      <p className="text-muted-foreground text-[13px] leading-[18px]">
        Indobase Payments uses your Studio account. Sign in once — no separate Payments password.
      </p>
      <Button variant="primary" type="button" className="w-full" onClick={studioSignIn}>
        Sign in with Studio
      </Button>
      {error ? <div className="text-sm text-destructive">{error}</div> : null}
    </div>
  )
}
