import { useEffect } from 'react'

import { Loading } from '@/components/Loading'
import { redirectToStudioSignIn } from '@/lib/studioAuthRedirect'

/** Legacy password-reset inbox page — redirect to Studio. */
export const CheckInboxPassword = (): JSX.Element => {
  useEffect(() => {
    redirectToStudioSignIn()
  }, [])

  return <Loading />
}
