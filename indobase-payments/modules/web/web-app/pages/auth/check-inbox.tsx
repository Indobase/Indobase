import { useEffect } from 'react'

import { Loading } from '@/components/Loading'
import { redirectToStudioSignIn } from '@/lib/studioAuthRedirect'

/** Legacy email magic-link inbox page — redirect to Studio. */
export const CheckInbox = (): JSX.Element => {
  useEffect(() => {
    redirectToStudioSignIn()
  }, [])

  return <Loading />
}
