import Link from 'next/link'
import { useRouter } from 'next/router'

import { SignInForm } from 'components/interfaces/SignIn/SignInForm'
import { AuthenticationLayout } from 'components/layouts/AuthenticationLayout'
import SignInLayout from 'components/layouts/SignInLayout/SignInLayout'
import { useIsFeatureEnabled } from 'hooks/misc/useIsFeatureEnabled'
import type { NextPageWithLayout } from 'types'

const SignInPage: NextPageWithLayout = () => {
  const router = useRouter()

  const {
    dashboardAuthSignInWithEmail: signInWithEmailEnabled,
    dashboardAuthSignUp: signUpEnabled,
  } = useIsFeatureEnabled(['dashboard_auth:sign_in_with_email', 'dashboard_auth:sign_up'])

  return (
    <>
      <div className="flex flex-col gap-5">
        {signInWithEmailEnabled && <SignInForm />}
      </div>

      {signUpEnabled && (
        <div className="self-center my-8 text-sm">
          <div>
            <span className="text-foreground-light">Don’t have an account?</span>{' '}
            <Link
              href={{
                pathname: '/sign-up',
                query: router.query,
              }}
              className="underline transition text-foreground hover:text-foreground-light"
            >
              Sign up
            </Link>
          </div>
        </div>
      )}
    </>
  )
}

SignInPage.getLayout = (page) => (
  <AuthenticationLayout>
    <SignInLayout
      heading="Welcome back"
      subheading="Sign in to your account"
      logoLinkToMarketingSite={true}
    >
      {page}
    </SignInLayout>
  </AuthenticationLayout>
)

export const getServerSideProps = async () => ({
  props: {},
})

export default SignInPage
