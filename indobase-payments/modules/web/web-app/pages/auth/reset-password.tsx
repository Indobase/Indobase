import { useEffect } from 'react'

import { Loading } from '@/components/Loading'
import { redirectToStudioSignIn } from '@/lib/studioAuthRedirect'

/** Password reset lives in Studio — not on Payments. */
export const ResetPassword = (): JSX.Element => {
  useEffect(() => {
    redirectToStudioSignIn()
  }, [])

  return <Loading />
}
