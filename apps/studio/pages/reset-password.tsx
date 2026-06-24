import * as Sentry from '@sentry/nextjs'
import { useRouter } from 'next/router'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

import { getAccessToken } from 'common'
import ResetPasswordForm from 'components/interfaces/SignIn/ResetPasswordForm'
import ForgotPasswordLayout from 'components/layouts/SignInLayout/ForgotPasswordLayout'
import { auth, buildPathWithParams } from 'lib/gotrue'
import type { NextPageWithLayout } from 'types'
import { LogoLoader } from 'ui'

const ResetPasswordPage: NextPageWithLayout = () => {
  const router = useRouter()
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    auth
      .initialize()
      .then(async ({ error }) => {
        if (error) {
          setLoading(false)
          return
        }

        const token = await getAccessToken()
        if (!token) {
          router.replace(buildPathWithParams('/sign-in'))
          return
        }

        const { data, error: aalError } = await auth.mfa.getAuthenticatorAssuranceLevel()
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
      })
      .catch((error) => {
        Sentry.captureException(error)
        console.error('Auth initialization error:', error)
        toast.error('Failed to initialize authentication. Please try again.')
        setLoading(false)
        router.replace(buildPathWithParams('/sign-in'))
      })
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
