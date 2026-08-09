import type { GetServerSideProps } from 'next'
import Link from 'next/link'

import { SignUpForm } from 'components/interfaces/SignIn/SignUpForm'
import SignInLayout from 'components/layouts/SignInLayout/SignInLayout'
import { UnknownInterface } from 'components/ui/UnknownInterface'
import { useIsFeatureEnabled } from 'hooks/misc/useIsFeatureEnabled'
import { getPublicBuilderUrl } from 'lib/constants/builder-url'
import type { NextPageWithLayout } from 'types'

/**
 * Builder-first: marketing / cold signup should land in Builder (agentic OS).
 * Keep this page as a fallback when redirect is disabled (?studio=1).
 */
export const getServerSideProps: GetServerSideProps = async (ctx) => {
  if (ctx.query.studio === '1' || ctx.query.studio === 'true') {
    return { props: {} }
  }
  const builder = getPublicBuilderUrl()
  return {
    redirect: {
      destination: builder,
      permanent: false,
    },
  }
}

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
