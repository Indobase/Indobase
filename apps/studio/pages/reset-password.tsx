import * as Sentry from '@sentry/nextjs'

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
import { verifyOtpViaPlatform } from 'lib/password-recovery-api'
import {
  ensureActiveRecoverySession,
  markPasswordRecoverySession,
} from 'lib/password-recovery-session'

import type { NextPageWithLayout } from 'types'

import { LogoLoader } from 'ui'

const ResetPasswordPage: NextPageWithLayout = () => {
  const router = useRouter()
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!router.isReady) return

    const {
      data: { subscription },
    } = auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        markPasswordRecoverySession()
      }
    })

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
        let verifiedInlineRecovery = false

        if (token_hash && type === 'recovery') {
          const { error: verifyError } = await verifyOtpViaPlatform({ type, token_hash })
          if (cancelled) return

          if (verifyError) {
            toast.error(verifyError.message)
            router.replace(buildPathWithParams('/forgot-password'))
            return
          }

          markPasswordRecoverySession()
          verifiedInlineRecovery = true
          await new Promise((resolve) => setTimeout(resolve, 500))
        }

        const sessionResult = await ensureActiveRecoverySession({
          allowInlineRecovery: verifiedInlineRecovery,
        })
        if (cancelled) return

        if (!sessionResult.ok) {
          toast.error(
            sessionResult.message ??
              'Your password reset session has expired. Please request a new reset link.'
          )
          router.replace(buildPathWithParams('/forgot-password'))
          return
        }

        const { data, error: aalError } = await auth.mfa.getAuthenticatorAssuranceLevel()
        if (cancelled) return

        if (aalError) {
          // Public Kong may reject anon key; session was already validated via Studio proxy.
          console.warn('Skipping MFA assurance check:', aalError.message)
        } else if (data && data.currentLevel !== data.nextLevel) {
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
      subscription.unsubscribe()
    }
  }, [router])

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
