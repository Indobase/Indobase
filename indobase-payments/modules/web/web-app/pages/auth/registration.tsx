import { useEffect } from 'react'

import { Loading } from '@/components/Loading'
import { env } from '@/lib/env'

/**
 * No Payments-native signup — create accounts in Studio, then open Payments via handoff.
 */
export const Registration = (): JSX.Element => {
  useEffect(() => {
    const studio = env.studioUrl.replace(/\/+$/, '')
    window.location.replace(`${studio}/sign-up`)
  }, [])

  return <Loading />
}
