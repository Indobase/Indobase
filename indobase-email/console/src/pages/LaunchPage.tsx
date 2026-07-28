import { useEffect, useRef } from 'react'
import { Spin } from 'antd'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { useAuth } from '../contexts/AuthContext'
import { writeEmailLastProjectRef } from '../lib/emailSessionStorage'

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
  const { signin, isAuthenticated, loading } = useAuth()
  const search = useSearch({ from: '/console/launch' })
  const startedRef = useRef(false)

  useEffect(() => {
    if (startedRef.current) return
    if (loading) return

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
      startedRef.current = true
      const cleanUrl = new URL(window.location.href)
      cleanUrl.hash = ''
      window.history.replaceState({}, '', cleanUrl.toString())

      void (async () => {
        try {
          await signin(sessionToken)
          writeEmailLastProjectRef(projectRef)
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
          navigate({
            to: '/console/signin',
            search: {
              error: 'Your Email session could not be started. Open Email again from Studio.',
              ...(projectRef ? { project_ref: projectRef } : {})
            },
            replace: true
          })
        }
      })()
      return
    }

    // Hop 1: exchange Studio handoff JWT
    if (studioToken) {
      startedRef.current = true
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

    // No handoff token: resume an existing Email session when possible.
    if (isAuthenticated) {
      startedRef.current = true
      navigate({ to: '/console/', replace: true })
      return
    }

    const storedToken = localStorage.getItem('auth_token')
    if (storedToken) {
      // AuthContext is still validating or will clear invalid tokens — wait.
      return
    }

    startedRef.current = true
    navigate({
      to: '/console/signin',
      search: projectRef ? { project_ref: projectRef } : undefined,
      replace: true
    })
  }, [navigate, search, signin, isAuthenticated, loading])

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
