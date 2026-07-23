import { Button } from '@md/ui'
import { useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'

import { Loading } from '@/components/Loading'
import { redirectToStudioSignIn, studioSignInUrl } from '@/lib/studioAuthRedirect'

/**
 * Operators authenticate via Studio only. Never show Meteroid email/password login.
 * Failed handoffs land here with `?error=` so the operator can retry via Studio.
 */
export const Login = (): JSX.Element => {
  const [searchParams] = useSearchParams()
  const error = searchParams.get('error')
  const projectRef = searchParams.get('project_ref')
  const returnUrl = searchParams.get('returnUrl')

  useEffect(() => {
    if (error) return
    redirectToStudioSignIn({ projectRef, returnUrl })
  }, [error, projectRef, returnUrl])

  if (!error) {
    return <Loading />
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-destructive">{error}</p>
      <p className="text-muted-foreground text-[13px] leading-[18px]">
        Indobase Payments uses your Studio account. Sign in once — no separate Payments password.
      </p>
      <Button
        variant="primary"
        type="button"
        className="w-full"
        onClick={() => {
          window.location.assign(studioSignInUrl({ projectRef, returnUrl }))
        }}
      >
        Sign in with Studio
      </Button>
    </div>
  )
}
