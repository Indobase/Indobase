import { useEffect } from 'react'

import { Loading } from '@/components/Loading'
import { redirectToStudioSignIn } from '@/lib/studioAuthRedirect'

/** Legacy email validation page — redirect to Studio. */
export const ValidateEmail = (): JSX.Element => {
  useEffect(() => {
    redirectToStudioSignIn()
  }, [])

  return <Loading />
}
