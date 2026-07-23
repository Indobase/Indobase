import { useEffect } from 'react'

import { Loading } from '@/components/Loading'
import { redirectToStudioSignIn } from '@/lib/studioAuthRedirect'

/**
 * No Payments-native signup — Studio is the only IdP. Send operators to Studio
 * sign-in (not sign-up) so an existing session can complete the handoff.
 */
export const Registration = (): JSX.Element => {
  useEffect(() => {
    redirectToStudioSignIn()
  }, [])

  return <Loading />
}
