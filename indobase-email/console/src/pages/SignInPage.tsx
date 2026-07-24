import { useEffect } from 'react'
import { Spin } from 'antd'
import { useSearch } from '@tanstack/react-router'
import { redirectToStudioSignIn } from '../lib/studioAuthRedirect'

/**
 * Public Email sign-in is disabled — operators use Indobase Studio SSO only.
 * This page only exists as a redirect target for legacy bookmarks.
 */
export function SignInPage() {
  const search = useSearch({ from: '/console/signin' })

  useEffect(() => {
    redirectToStudioSignIn({
      projectRef: typeof search.email === 'string' ? null : null
    })
  }, [search])

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
      <Spin size="large" tip="Redirecting to Indobase Studio…" />
    </div>
  )
}
