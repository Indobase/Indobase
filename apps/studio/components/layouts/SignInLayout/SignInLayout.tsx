import { useQueryClient } from '@tanstack/react-query'
import { useTheme } from 'next-themes'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { PropsWithChildren, useEffect, useState } from 'react'

import { getAccessToken, useFlag } from 'common'
import { ensureRuntimePublicEnv } from 'common/public-env'
import { DocsButton } from 'components/ui/DocsButton'
import { useIsFeatureEnabled } from 'hooks/misc/useIsFeatureEnabled'
import { BASE_PATH, DOCS_URL } from 'lib/constants'
import { auth, buildPathWithParams, getReturnToPath } from 'lib/gotrue'

type Testimonial = {
  text: string
  name: string
  role?: string
}

const testimonials: Testimonial[] = [
  {
    text: 'Indobase made our onboarding flow simple and fast. The setup felt effortless.',
    name: 'Sivakumar gingee',
    role: 'Chief Executive Officer',
  },
  {
    text: 'The dashboard is clean, fast, and easy to understand. Indobase just works.',
    name: 'Roshan Raghavander',
    role: 'Chief Technology Officer',
  },
  {
    text: 'We shipped our MVP in days with Indobase. The developer experience is excellent.',
    name: 'Prabhu',
    role: 'Chief Growth Officer',
  },
  {
    text: 'Indobase helped us move from idea to production quickly and confidently.',
    name: 'Aniket',
    role: 'Full-stack Developer',
  },
]

type SignInLayoutProps = {
  heading: string
  subheading: string
  showDisclaimer?: boolean
  logoLinkToMarketingSite?: boolean
}

const SignInLayout = ({
  heading,
  subheading,
  showDisclaimer = true,
  logoLinkToMarketingSite = false,
  children,
}: PropsWithChildren<SignInLayoutProps>) => {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { resolvedTheme } = useTheme()
  const ongoingIncident = useFlag('ongoingIncident')

  const {
    dashboardAuthShowTestimonial: showTestimonial,
    brandingLargeLogo: largeLogo,
    dashboardAuthShowTos: showTos,
  } = useIsFeatureEnabled([
    'dashboard_auth:show_testimonial',
    'branding:large_logo',
    'dashboard_auth:show_tos',
  ])

  // This useEffect redirects the user to MFA if they're already halfway signed in
  useEffect(() => {
    let cancelled = false

    const run = async () => {
      await ensureRuntimePublicEnv(`${BASE_PATH}/api/platform/runtime-public-env`)
      if (cancelled) return

      auth
        .initialize()
        .then(async ({ error }) => {
        if (error) {
          // if there was a problem signing in via the url, don't redirect
          return
        }

        const token = await getAccessToken()

        if (token) {
          const { data, error } = await auth.mfa.getAuthenticatorAssuranceLevel()
          if (error) {
            // if there was a problem signing in via the url, don't redirect
            return
          }

          if (data) {
            // we're already where we need to be
            if (router.pathname === '/sign-in-mfa') {
              return
            }
            if (data.currentLevel !== data.nextLevel) {
              const redirectTo = buildPathWithParams('/sign-in-mfa')
              router.replace(redirectTo)
              return
            }
          }

          await queryClient.resetQueries()
          router.push(getReturnToPath())
        }
        })
        .catch(() => {}) // catch all errors thrown by auth methods
    }

    run()

    return () => {
      cancelled = true
    }
  }, [])

  const [quote, setQuote] = useState<Testimonial | null>(null)

  useEffect(() => {
    // Weighted random selection
    // Calculate total weight (default weight is fallbackWeight for tweets without weight specified)
    const fallbackWeight = 1
    const totalWeight = testimonials.reduce((sum) => sum + fallbackWeight, 0)

    // Generate random number between 0 and totalWeight
    const random = Math.random() * totalWeight

    // Find the selected tweet based on cumulative weights
    let accumulatedWeight = 0
    for (const testimonial of testimonials) {
      const weight = fallbackWeight
      accumulatedWeight += weight
      if (random <= accumulatedWeight) {
        setQuote(testimonial)
        break
      }
    }
  }, [])

  const initials = quote?.name
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)

  return (
    <>
      <div className="relative flex flex-col bg-alternative min-h-screen">
        <div
          className={`absolute top-0 w-full px-8 mx-auto sm:px-6 lg:px-8 ${
            ongoingIncident ? 'mt-14' : 'mt-6'
          }`}
        >
          <nav className="relative flex items-center justify-between sm:h-10">
            <div className="flex items-center flex-grow flex-shrink-0 lg:flex-grow-0">
              <div className="flex items-center justify-between w-full md:w-auto">
                <Link href={logoLinkToMarketingSite ? 'https://indobase.in' : '/organizations'}>
                  <img
                    src={`${BASE_PATH}/img/indobase-brand.png`}
                    alt="Indobase Logo"
                    className={largeLogo ? 'h-[48px] w-auto' : 'h-[32px] w-auto'}
                  />
                </Link>
              </div>
            </div>

            <div className="items-center hidden space-x-3 md:ml-10 md:flex md:pr-4">
              <DocsButton abbrev={false} href={`${DOCS_URL}`} />
            </div>
          </nav>
        </div>

        {/*
          Centered card rather than the previous full-bleed split. The old layout stretched the form
          to half the viewport, so on a wide monitor a 384px form sat in a ~900px column of empty
          panel. The card bounds the whole thing and pairs the form with an illustration panel.
        */}
        <div className="flex flex-1 items-center justify-center px-4 py-24 sm:px-6">
          <div className="w-full max-w-[1040px] overflow-hidden rounded-2xl border border-default bg-studio shadow-2xl lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <main className="flex flex-col items-center px-6 py-12 sm:px-10">
              <div className="flex w-full max-w-[384px] flex-1 flex-col justify-center">
                <div className="mb-10">
                  <h1 className="mb-2 lg:text-3xl">{heading}</h1>
                  <h2 className="text-sm text-foreground-light">{subheading}</h2>
                </div>

                {children}
              </div>

              {showDisclaimer && showTos && (
                <div className="mt-10 text-balance text-center">
                  <p className="text-xs text-foreground-lighter sm:mx-auto sm:max-w-sm">
                    By continuing, you agree to Indobase’s{' '}
                    <Link
                      href="https://indobase.in/terms"
                      className="underline hover:text-foreground-light"
                    >
                      Terms of Service
                    </Link>{' '}
                    and{' '}
                    <Link
                      href="https://indobase.in/privacy"
                      className="underline hover:text-foreground-light"
                    >
                      Privacy Policy
                    </Link>
                    , and to receive periodic emails with updates.
                  </p>
                </div>
              )}
            </main>

            {/*
              Illustration panel. Hidden below lg so the form keeps the full card on small screens —
              the panel is decoration and must never push the inputs into a narrow column.
            */}
            <aside className="relative hidden flex-col justify-between overflow-hidden bg-[#EAF3FB] p-10 dark:bg-[#12212E] lg:flex">
              {/*
                Fills the panel and is anchored to the top, so the shapes spread across the width
                instead of stacking in a column. The artwork's lower third is intentionally sparse —
                the testimonial card sits over it.
              */}
              <img
                src={`${BASE_PATH}/img/auth-illustration.svg`}
                alt=""
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 h-full w-full object-cover object-top opacity-95"
              />

              {quote !== null && showTestimonial && (
                <figure className="relative z-10 mt-auto rounded-xl border border-default/60 bg-studio/85 p-6 backdrop-blur-sm">
                  <blockquote className="text-base leading-relaxed text-foreground">
                    “{quote.text}”
                  </blockquote>

                  <figcaption className="mt-4 flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full border border-default bg-surface-200 text-xs text-foreground">
                      {initials}
                    </div>
                    <div className="flex flex-col">
                      <cite className="whitespace-nowrap font-medium not-italic text-foreground-light">
                        {quote.name}
                      </cite>
                      {quote.role && (
                        <span className="text-xs text-foreground-lighter">{quote.role}</span>
                      )}
                    </div>
                  </figcaption>
                </figure>
              )}
            </aside>
          </div>
        </div>
      </div>
    </>
  )
}

export default SignInLayout
