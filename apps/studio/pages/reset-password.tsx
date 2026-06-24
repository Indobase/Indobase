import * as Sentry from '@sentry/nextjs'
import { useAuth } from 'common'
import { useRouter } from 'next/router'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

import ResetPasswordForm from 'components/interfaces/SignIn/ResetPasswordForm'
import ForgotPasswordLayout from 'components/layouts/SignInLayout/ForgotPasswordLayout'
import {
  readAuthConfirmTokenHash,
  readAuthConfirmType,
} from 'lib/auth-confirm-params'
import { auth, buildPathWithParams } from 'lib/gotrue'
import type { NextPageWithLayout } from 'types'
import { LogoLoader } from 'ui'

async function ensureActiveRecoverySession(): Promise<{
  ok: boolean
  message?: string
}> {
  const {
    data: { session },
    error: sessionError,
  } = await auth.getSession()

  if (sessionError) {
    return { ok: false, message: sessionError.message }
  }

  if (session?.access_token) {
    return { ok: true }
  }

  const {
    data: { session: refreshed },
    error: refreshError,
  } = await auth.refreshSession()

  if (refreshError) {
    return { ok: false, message: refreshError.message }
  }

  if (refreshed?.access_token) {
    return { ok: true }
  }

  return { ok: false, message: 'Your password reset session has expired.' }
}

const ResetPasswordPage: NextPageWithLayout = () => {
  const router = useRouter()
  const { refreshSession } = useAuth()
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!router.isReady) return

    let cancelled = false

    ;(async () => {
      try {
        const { error: initError } = await auth.initialize()
        if (cancelled) return

        if (initError) {
          toast.error('Failed to initialize authentication. Please try again.')
          router.replace(buildPathWithParams('/forgot-password'))
          return
        }

        const token_hash = readAuthConfirmTokenHash(router.query)
        const type = readAuthConfirmType(router.query)

        if (token_hash && type === 'recovery') {
          const { error: verifyError } = await auth.verifyOtp({ type, token_hash })
          if (cancelled) return

          if (verifyError) {
            toast.error(verifyError.message)
            router.replace(buildPathWithParams('/forgot-password'))
            return
          }

          await new Promise((resolve) => setTimeout(resolve, 500))
        }

        const sessionResult = await ensureActiveRecoverySession()
        if (cancelled) return

        if (!sessionResult.ok) {
          toast.error(
            sessionResult.message ??
              'Your password reset session has expired. Please request a new reset link.'
          )
          router.replace(buildPathWithParams('/forgot-password'))
          return
        }

        await refreshSession()

        const { data, error: aalError } = await auth.mfa.getAuthenticatorAssuranceLevel()
        if (cancelled) return

        if (aalError) {
          toast.error(
            `Failed to verify your session: ${aalError.message}. Please start the reset flow again.`
          )
          router.replace(buildPathWithParams('/forgot-password'))
          return
        }

        if (data && data.currentLevel !== data.nextLevel) {
          router.replace(buildPathWithParams('/forgot-password-mfa'))
          return
        }

        setLoading(false)
      } catch (error) {
        Sentry.captureException(error)
        console.error('Auth initialization error:', error)
        toast.error('Failed to initialize authentication. Please try again.')
        router.replace(buildPathWithParams('/forgot-password'))
      }
    })()

    return () => {
      cancelled = true
    }
  }, [router, refreshSession])

  if (loading) {
    return (
      <div className="flex flex-col flex-1 bg-alternative h-screen items-center justify-center">
        <LogoLoader />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <ResetPasswordForm />
    </div>
  )
}

ResetPasswordPage.getLayout = (page) => (
  <ForgotPasswordLayout
    heading="Change your password"
    subheading="Welcome back! Choose a new strong password and save it to proceed"
  >
    {page}
  </ForgotPasswordLayout>
)

export default ResetPasswordPage
