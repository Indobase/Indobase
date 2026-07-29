import { useAuth } from 'common'
import { gotrueClient } from 'common/gotrue'
import { SessionTimeoutModal } from 'components/interfaces/SignIn/SessionTimeoutModal'
import { usePermissionsQuery } from 'data/permissions/permissions-query'
import { useAuthenticatorAssuranceLevelQuery } from 'data/profile/mfa-authenticator-assurance-level-query'
import { shouldDeferAuthRedirect } from 'lib/auth-navigation'
import { BASE_PATH } from 'lib/constants'
import { buildPathWithParams } from 'lib/gotrue'
import { useRouter } from 'next/router'
import { ComponentType, useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { isNextPageWithLayout, type NextPageWithLayout } from 'types'
import { LogoLoader } from 'ui'

const MAX_TIMEOUT = 10000 // 10 seconds

export function withAuth<T>(
  WrappedComponent: ComponentType<T> | NextPageWithLayout<T, T>,
  options: {
    /**
     * The auth level used to check the user credentials. In most cases, if the user has MFA enabled
     * we want the highest level (which is 2) for all pages. For certain pages, the user should be
     * able to access them even if he didn't finished his login (typed in his MFA code), for example
     * the support page: We want the user to be able to submit a ticket even if he's not fully
     * signed in.
     * @default true
     */
    useHighestAAL: boolean
  } = { useHighestAAL: true }
) {
  const WithAuthHOC: ComponentType<T> = (props) => {
    const router = useRouter()
    const { isLoading, session } = useAuth()

    const timeoutIdRef = useRef<NodeJS.Timeout | null>(null)
    const [isSessionTimeoutModalOpen, setIsSessionTimeoutModalOpen] = useState(false)

    const isLoggedIn = Boolean(session)
    const isAuthReady = !isLoading

    const {
      isPending: isAALLoading,
      data: aalData,
      isError: isErrorAAL,
      error: errorAAL,
    } = useAuthenticatorAssuranceLevelQuery({
      enabled: isAuthReady && isLoggedIn && options.useHighestAAL,
    })

    useEffect(() => {
      if (isErrorAAL) {
        toast.error(
          `Failed to fetch authenticator assurance level: ${errorAAL?.message}. Try refreshing your browser, or reach out to us via a support ticket if the issue persists`
        )
      }
    }, [isErrorAAL, errorAAL])

    const { isError: isErrorPermissions, error: errorPermissions } = usePermissionsQuery()

    useEffect(() => {
      if (isErrorPermissions) {
        toast.error(
          `Failed to fetch permissions: ${errorPermissions?.message}. Try refreshing your browser, or reach out to us via a support ticket if the issue persists`
        )
      }
    }, [isErrorPermissions, errorPermissions])

    const isFinishedLoading =
      isAuthReady && (!options.useHighestAAL || !isLoggedIn || !isAALLoading)

    const redirectToSignIn = useCallback(() => {
      let pathname = location.pathname
      if (BASE_PATH) {
        pathname = pathname.replace(BASE_PATH, '')
      }

      if (pathname === '/sign-in') {
        // If the user is already on the sign in page, we don't need to redirect them
        return
      }

      const searchParams = new URLSearchParams(location.search)
      const returnTo = `${pathname}${location.search}${location.hash}`
      searchParams.set('returnTo', returnTo)

      router.push(`/sign-in?${searchParams.toString()}`)
    }, [router])

    useEffect(() => {
      // Only warn when GoTrue session restore stalls — not when MFA/AAL is slow.
      if (!isAuthReady) {
        timeoutIdRef.current = setTimeout(() => {
          setIsSessionTimeoutModalOpen(true)
        }, MAX_TIMEOUT)
      } else {
        if (timeoutIdRef.current) {
          clearTimeout(timeoutIdRef.current)
          timeoutIdRef.current = null
        }
        setIsSessionTimeoutModalOpen(false)
      }

      return () => {
        if (timeoutIdRef.current) {
          clearTimeout(timeoutIdRef.current)
        }
      }
    }, [isAuthReady, router, redirectToSignIn])

    const isCorrectLevel = options.useHighestAAL
      ? aalData?.currentLevel === aalData?.nextLevel
      : true

    const shouldRedirectToAuth = isFinishedLoading && (!isLoggedIn || !isCorrectLevel)
    const [gotrueHasSession, setGotrueHasSession] = useState(false)

    useEffect(() => {
      if (!shouldRedirectToAuth || isLoggedIn) {
        setGotrueHasSession(false)
        return
      }

      let cancelled = false
      void gotrueClient.getSession().then(({ data: { session } }) => {
        if (!cancelled) {
          setGotrueHasSession(Boolean(session?.user))
        }
      })

      return () => {
        cancelled = true
      }
    }, [shouldRedirectToAuth, isLoggedIn])

    const deferAuthRedirect = shouldDeferAuthRedirect({
      isLoggedIn,
      shouldRedirectToAuth,
      gotrueHasSession,
    })

    const shouldRedirect = shouldRedirectToAuth && !deferAuthRedirect
    const showAuthGateLoader = !isFinishedLoading || deferAuthRedirect || shouldRedirect

    useEffect(() => {
      if (shouldRedirect) {
        // Clear the timeout if it's still active and we are redirecting
        if (timeoutIdRef.current) {
          clearTimeout(timeoutIdRef.current)
          timeoutIdRef.current = null
        }
        if (isLoggedIn && !isCorrectLevel) {
          router.push(buildPathWithParams('/sign-in-mfa'))
          return
        }
        redirectToSignIn()
      }
    }, [redirectToSignIn, shouldRedirect, isLoggedIn, isCorrectLevel, router])

    const InnerComponent = WrappedComponent as any

    // Don't render the wrapped page while auth is resolving or redirecting — the page layout
    // (e.g. PageLayout title on /organizations) still mounts, so an empty fragment looks like
    // a blank white content area under "Your Organizations".
    if (showAuthGateLoader) {
      return (
        <>
          <SessionTimeoutModal
            visible={isSessionTimeoutModalOpen}
            onClose={() => setIsSessionTimeoutModalOpen(false)}
            redirectToSignIn={redirectToSignIn}
          />
          <div className="flex min-h-[40vh] items-center justify-center p-8">
            <LogoLoader />
          </div>
        </>
      )
    }

    const supportContext =
      typeof router.query.ref === 'string' && router.pathname.startsWith('/project/')
        ? {
            projectRef: router.query.ref,
            ...(typeof router.query.organizationSlug === 'string' && {
              orgSlug: router.query.organizationSlug,
            }),
          }
        : undefined

    return (
      <>
        <SessionTimeoutModal
          visible={isSessionTimeoutModalOpen}
          onClose={() => setIsSessionTimeoutModalOpen(false)}
          redirectToSignIn={redirectToSignIn}
          supportContext={supportContext}
        />
        <InnerComponent {...props} />
      </>
    )
  }

  WithAuthHOC.displayName = `withAuth(${WrappedComponent.displayName})`

  if (isNextPageWithLayout(WrappedComponent)) {
    ;(WithAuthHOC as NextPageWithLayout<T, T>).getLayout = WrappedComponent.getLayout
  }

  return WithAuthHOC
}
