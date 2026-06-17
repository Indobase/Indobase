import { useRouter } from 'next/router'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

import type { EmailOtpType } from '@indobaseinc/indobase-js'
import { BASE_PATH } from 'lib/constants'
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

    const token_hash = typeof router.query.token_hash === 'string' ? router.query.token_hash : ''
    const type = typeof router.query.type === 'string' ? (router.query.type as EmailOtpType) : null
    const nextRaw = typeof router.query.next === 'string' ? router.query.next : ''
    const next =
      nextRaw && nextRaw.startsWith('/') && !nextRaw.includes('://')
        ? nextRaw
        : type === 'recovery'
          ? `${BASE_PATH}/reset-password`
          : `${BASE_PATH}/organizations`

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
