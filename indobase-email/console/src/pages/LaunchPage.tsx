import { useEffect, useRef } from 'react'
import { Spin } from 'antd'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { useAuth } from '../contexts/AuthContext'
import { redirectToStudioSignIn } from '../lib/studioAuthRedirect'

/**
 * Studio → Indobase Email SSO entry (mirrors Payments `/launch`).
 *
 * 1. Studio opens `/console/launch?project_ref=…&from=studio#token=<Studio JWT>`
 * 2. We full-page GET `/api/studio.handoff?token=…` (no CORS)
 * 3. API redirects back here with `#auth_token=<session>&workspace_id=…`
 * 4. We store the session and open the project workspace
 */
export function LaunchPage() {
  const navigate = useNavigate()
  const { signin } = useAuth()
  const search = useSearch({ from: '/console/launch' })
  const startedRef = useRef(false)

  useEffect(() => {
    if (startedRef.current) return
    startedRef.current = true

    const projectRef =
      typeof search.project_ref === 'string' ? search.project_ref : null

    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''))
    const sessionToken = hashParams.get('auth_token')
    const workspaceId = hashParams.get('workspace_id')
    const studioToken =
      hashParams.get('token') ||
      hashParams.get('handoff') ||
      (typeof search.token === 'string' ? search.token : null)

    // Hop 2: session already minted by `/api/studio.handoff`
    if (sessionToken) {
      const cleanUrl = new URL(window.location.href)
      cleanUrl.hash = ''
      window.history.replaceState({}, '', cleanUrl.toString())

      void (async () => {
        try {
          await signin(sessionToken)
          if (workspaceId) {
            navigate({
              to: '/console/workspace/$workspaceId',
              params: { workspaceId },
              replace: true
            })
          } else {
            navigate({ to: '/console/', replace: true })
          }
        } catch {
          redirectToStudioSignIn({ projectRef })
        }
      })()
      return
    }

    // Hop 1: exchange Studio handoff JWT
    if (studioToken) {
      const cleanUrl = new URL(window.location.href)
      cleanUrl.hash = ''
      cleanUrl.searchParams.delete('token')
      cleanUrl.searchParams.delete('handoff')
      window.history.replaceState({}, '', cleanUrl.toString())

      const exchange = new URL('/api/studio.handoff', window.location.origin)
      exchange.searchParams.set('token', studioToken)
      window.location.replace(exchange.toString())
      return
    }

    redirectToStudioSignIn({ projectRef })
  }, [navigate, search, signin])

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#F8FAFC'
      }}
    >
      <Spin size="large" tip="Opening Indobase Email…" />
    </div>
  )
}
