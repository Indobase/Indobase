import { Navigate, useNavigate } from 'react-router-dom'

import { useSession } from '@/features/auth'
import { env } from '@/lib/env'
import { queryClient } from '@/lib/react-query'

export function useLogout() {
  const [, , clearSession] = useSession()
  const navigate = useNavigate()

  return (message?: string) => {
    if (message) {
      console.error(`${message}, redirecting to Studio sign-in`)
    }
    queryClient.clear()
    clearSession()
    const studio = env.studioUrl.replace(/\/+$/, '')
    window.location.assign(`${studio}/sign-in?returnTo=${encodeURIComponent('/')}`)
    navigate('/login')
    return <Navigate to="/login" />
  }
}
