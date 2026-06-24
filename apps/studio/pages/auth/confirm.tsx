import { useRouter } from 'next/router'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

import {
  readAuthConfirmTokenHash,
  readAuthConfirmType,
  resolveAuthConfirmNextPath,
} from 'lib/auth-confirm-params'
import { auth } from 'lib/gotrue'
import type { NextPageWithLayout } from 'types'

/**
 * Handles GoTrue email action links (recovery, signup, etc.) when Site URL is Studio.
 * Magic links use /auth/confirm?token_hash=…&type=…&next=… — not /auth/v1/verify on the Studio host.
 */
const AuthConfirmPage: NextPageWithLayout = () => {
  const router = useRouter()
  const [message, setMessage] = useState('Confirming…')

  useEffect(() => {
    if (!router.isReady) return

    const token_hash = readAuthConfirmTokenHash(router.query)
    const type = readAuthConfirmType(router.query)
    const next = resolveAuthConfirmNextPath(
      router.query,
      type,
      typeof window !== 'undefined' ? window.location.origin : ''
    )

    if (!token_hash || !type) {
      setMessage('Invalid or expired link.')
      return
    }

    let cancelled = false

    ;(async () => {
      const { error } = await auth.verifyOtp({ type, token_hash })
      if (cancelled) return

      if (error) {
        setMessage(error.message)
        toast.error(error.message)
        return
      }

      const {
        data: { session },
      } = await auth.getSession()
      if (!session) {
        await auth.refreshSession()
      }

      await new Promise((resolve) => setTimeout(resolve, 500))
      if (cancelled) return

      await router.replace(next)
    })()

    return () => {
      cancelled = true
    }
  }, [router])

  return (
    <div className="flex min-h-[40vh] items-center justify-center p-6 text-center text-sm text-foreground-light">
      {message}
    </div>
  )
}

// Avoid layout chrome while confirming
AuthConfirmPage.getLayout = (page) => page

export default AuthConfirmPage
