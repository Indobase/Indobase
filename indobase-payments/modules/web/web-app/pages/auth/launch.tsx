import { useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'

import { Loading } from '@/components/Loading'
import { env } from '@/lib/env'
import { redirectToStudioSignIn } from '@/lib/studioAuthRedirect'

/**
 * Studio → Payments SSO entry. Reads the short-lived handoff JWT from the URL
 * fragment (set by Studio `/payments/launch`) and exchanges it via the Payments API
 * (`GET /oauth/studio-handoff`) — same pattern as Builder `/launch`.
 *
 * Token lives in the hash so proxies never log it. Read it once synchronously —
 * Strict Mode / remounts must not clear the hash then conclude the token is missing.
 */
export const Launch = () => {
  const [searchParams] = useSearchParams()
  const startedRef = useRef(false)

  useEffect(() => {
    if (startedRef.current) return
    startedRef.current = true

    const projectRef = searchParams.get('project_ref')

    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''))
    const token =
      hashParams.get('token') ||
      hashParams.get('handoff') ||
      searchParams.get('token') ||
      searchParams.get('handoff')

    if (!token) {
      // No handoff — send operators to Studio sign-in (not Meteroid password login / sign-up).
      redirectToStudioSignIn({ projectRef })
      return
    }

    // Clear token from the address bar before navigating to the API.
    const cleanUrl = new URL(window.location.href)
    cleanUrl.hash = ''
    cleanUrl.searchParams.delete('token')
    cleanUrl.searchParams.delete('handoff')
    window.history.replaceState({}, '', cleanUrl.toString())

    // Full-page GET exchange (same pattern as OAuth callback) — no CORS needed.
    const exchange = new URL(
      `${env.meteroidRestApiUri.replace(/\/+$/, '')}/oauth/studio-handoff`
    )
    exchange.searchParams.set('token', token)
    window.location.replace(exchange.toString())
  }, [searchParams])

  return <Loading />
}
