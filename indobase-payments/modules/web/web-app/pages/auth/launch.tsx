import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'

import { Loading } from '@/components/Loading'
import { env } from '@/lib/env'

/**
 * Studio → Payments SSO entry. Reads the short-lived handoff JWT from the URL
 * fragment (set by Studio `/payments/launch`) and POSTs it to the Payments API
 * for session exchange — same pattern as Builder `/launch`.
 */
export const Launch = () => {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const projectRef = searchParams.get('project_ref')

    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''))
    const token =
      hashParams.get('token') ||
      hashParams.get('handoff') ||
      searchParams.get('token') ||
      searchParams.get('handoff')

    if (!token) {
      // No handoff — send operators to Studio sign-in (not Meteroid password login).
      const studio = env.studioUrl.replace(/\/+$/, '')
      const returnPath = projectRef
        ? `/project/${encodeURIComponent(projectRef)}/payments`
        : '/'
      window.location.replace(
        `${studio}/sign-in?returnTo=${encodeURIComponent(returnPath)}`
      )
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
  }, [navigate, searchParams])

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 p-8 text-center">
        <p className="text-sm text-muted-foreground">{error}</p>
        <button
          type="button"
          className="underline text-sm"
          onClick={() => {
            setError(null)
            window.location.assign(env.studioUrl)
          }}
        >
          Back to Studio
        </button>
      </div>
    )
  }

  return <Loading />
}
