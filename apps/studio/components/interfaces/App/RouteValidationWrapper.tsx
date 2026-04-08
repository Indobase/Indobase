import { LOCAL_STORAGE_KEYS, useIsLoggedIn, useIsMFAEnabled, useParams, useUser } from 'common'
import { useOrganizationsQuery } from 'data/organizations/organizations-query'
import { useProjectDetailQuery } from 'data/projects/project-detail-query'
import { useDashboardHistory } from 'hooks/misc/useDashboardHistory'
import useLatest from 'hooks/misc/useLatest'
import { useLocalStorageQuery } from 'hooks/misc/useLocalStorage'
import { useSelectedOrganizationQuery } from 'hooks/misc/useSelectedOrganization'
import { IS_PLATFORM } from 'lib/constants'
import { selfHostedDashboardPath } from 'lib/self-hosted-dashboard'
import { useRouter } from 'next/router'
import { PropsWithChildren, useEffect } from 'react'
import { toast } from 'sonner'
import { ResponseError } from 'types'

// Ideally these could all be within a _middleware when we use Next 12
export const RouteValidationWrapper = ({ children }: PropsWithChildren<{}>) => {
  const router = useRouter()
  const { ref, slug, id } = useParams()
  const { data: organization } = useSelectedOrganizationQuery()
  const user = useUser()

  const isLoggedIn = useIsLoggedIn()
  const isUserMFAEnabled = useIsMFAEnabled()

  const { setLastVisitedSnippet, setLastVisitedTable } = useDashboardHistory()
  const [lastVisitedOrganization, setLastVisitedOrganization] = useLocalStorageQuery(
    LOCAL_STORAGE_KEYS.LAST_VISITED_ORGANIZATION,
    ''
  )

  const DEFAULT_HOME = IS_PLATFORM
    ? !!lastVisitedOrganization
      ? `/org/${lastVisitedOrganization}`
      : '/organizations'
    : selfHostedDashboardPath(user?.id)

  // Self-hosted projects use ref `p-<gotrue_sub>`, not `default`. Old links/bookmarks still use /project/default.
  const skipLegacyDefaultProjectFetch = !IS_PLATFORM && ref === 'default'

  /**
   * Array of urls/routes that should be ignored
   */
  const excemptUrls: string[] = [
    // project creation route, allows the page to self determine it's own route, it will redirect to the first org
    // or prompt the user to create an organaization
    // this is used by database.dev, usually as /new/new-project
    '/new/[slug]',
    '/join',
    '/sign-in',
    '/sign-up',
    '/sign-in-sso',
    '/sign-in-mfa',
    '/sign-in-partner',
    '/sign-in-fly-tos',
  ]

  /**
   * Map through all the urls that are excluded
   * from route validation check
   *
   * @returns a boolean
   */
  function isExceptUrl() {
    return excemptUrls.includes(router?.pathname)
  }

  const { isError: isErrorProject, error: projectDetailError } = useProjectDetailQuery(
    { ref },
    { enabled: !skipLegacyDefaultProjectFetch }
  )

  const { data: organizations, isSuccess: orgsInitialized } = useOrganizationsQuery({
    enabled: isLoggedIn,
  })
  const organizationsRef = useLatest(organizations)

  useEffect(() => {
    // check if current route is excempted from route validation check
    if (isExceptUrl() || !isLoggedIn) return

    if (orgsInitialized && slug) {
      // Check validity of organization that user is trying to access
      const organizations = organizationsRef.current ?? []
      const isValidOrg = organizations.some((org) => org.slug === slug)

      if (!isValidOrg) {
        toast.error('You do not have access to this organization')
        router.push(`${DEFAULT_HOME}?error=org_not_found&org=${slug}`)
        return
      }
    }
  }, [orgsInitialized])

  // In self-hosted mode, `withAuth()` intentionally skips auth checks.
  // To make sure users land on the signup/signin flow instead of dashboard pages,
  // we do a lightweight redirect here when there is no session.
  useEffect(() => {
    if (IS_PLATFORM) return
    if (isLoggedIn) return
    if (isExceptUrl()) return

    const asPath = router.asPath ?? ''
    const dashboardPrefix = asPath.startsWith('/dashboard') ? '/dashboard' : ''

    // Avoid a redirect loop if we are already on the sign-in pages.
    if (
      router.pathname === '/sign-in' ||
      router.pathname === '/sign-up' ||
      router.pathname.startsWith('/sign-in')
    ) {
      return
    }

    router.push(`${dashboardPrefix}/sign-in`)
  }, [IS_PLATFORM, isLoggedIn, router, router.asPath])

  useEffect(() => {
    if (IS_PLATFORM || !router.isReady) return
    if (!isLoggedIn || !user?.id || ref !== 'default') return
    const suffix = router.asPath.startsWith('/project/default')
      ? router.asPath.slice('/project/default'.length)
      : ''
    const target = `${selfHostedDashboardPath(user.id)}${suffix}`
    if (router.asPath !== target) {
      router.replace(target)
    }
  }, [IS_PLATFORM, isLoggedIn, ref, router, router.asPath, router.isReady, user?.id])

  useEffect(() => {
    if (isExceptUrl() || !isLoggedIn) return
    // No project-detail fetch for legacy /project/default — redirect effect handles it.
    if (skipLegacyDefaultProjectFetch) return
    if (!ref || !isErrorProject) return

    const code =
      projectDetailError instanceof ResponseError ? projectDetailError.code : undefined

    if (IS_PLATFORM) {
      toast.error('You do not have access to this project')
      router.push(DEFAULT_HOME)
      return
    }

    // Self-hosted: 5xx / network errors are not "no access" (fixes misleading toast when platform API fails).
    if (code === undefined || code >= 500) {
      toast.error(
        code !== undefined && code >= 500
          ? 'Could not load project (server error). Check Studio logs and STUDIO_PG_META_URL / Postgres env.'
          : 'Could not load project. Check your connection and try again.'
      )
      return
    }

    if (code === 401) return

    if (code !== 403 && code !== 404) {
      toast.error(projectDetailError?.message ?? 'Could not load project.')
      return
    }

    toast.error('You do not have access to this project')
    router.push(DEFAULT_HOME)
  }, [
    DEFAULT_HOME,
    IS_PLATFORM,
    isErrorProject,
    isLoggedIn,
    projectDetailError,
    ref,
    router,
    skipLegacyDefaultProjectFetch,
  ])

  useEffect(() => {
    if (ref !== undefined && id !== undefined) {
      if (router.pathname.endsWith('/sql/[id]') && id !== 'new') {
        setLastVisitedSnippet(id)
      } else if (router.pathname.endsWith('/editor/[id]')) {
        setLastVisitedTable(id)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref, id])

  useEffect(() => {
    if (organization) {
      setLastVisitedOrganization(organization.slug)

      if (
        organization.organization_requires_mfa &&
        !isUserMFAEnabled &&
        router.pathname !== '/org/[slug]'
      ) {
        router.push(`/org/${organization.slug}`)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organization])

  return <>{children}</>
}
