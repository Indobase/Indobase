import Link from 'next/link'

import { SignUpForm } from 'components/interfaces/SignIn/SignUpForm'
import SignInLayout from 'components/layouts/SignInLayout/SignInLayout'
import { UnknownInterface } from 'components/ui/UnknownInterface'
import { useIsFeatureEnabled } from 'hooks/misc/useIsFeatureEnabled'
import type { NextPageWithLayout } from 'types'

const SignUpPage: NextPageWithLayout = () => {
  const { dashboardAuthSignUp: signUpEnabled } = useIsFeatureEnabled(['dashboard_auth:sign_up'])

  if (!signUpEnabled) {
    return <UnknownInterface fullHeight={false} urlBack="/sign-in" />
  }

  return (
    <>
      <div className="flex flex-col gap-5">
        <SignUpForm />
      </div>

      <div className="my-8 self-center text-sm">
        <span className="text-foreground-light">Have an account?</span>{' '}
        <Link
          href="/sign-in"
          className="underline text-foreground hover:text-foreground-light transition"
        >
          Sign in
        </Link>
      </div>
    </>
  )
}

SignUpPage.getLayout = (page) => (
  <SignInLayout heading="Get started" subheading="Create a new account">
    {page}
  </SignInLayout>
)

export default SignUpPage
