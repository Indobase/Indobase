import { LOCAL_STORAGE_KEYS, useIsLoggedIn, useIsMFAEnabled, useParams, useUser } from 'common'
import { useOrganizationsQuery } from 'data/organizations/organizations-query'
import { useProjectDetailQuery } from 'data/projects/project-detail-query'
import { useDashboardHistory } from 'hooks/misc/useDashboardHistory'
import useLatest from 'hooks/misc/useLatest'
import { useLocalStorageQuery } from 'hooks/misc/useLocalStorage'
import { useSelectedOrganizationQuery } from 'hooks/misc/useSelectedOrganization'
import { BASE_PATH } from 'lib/constants'
import { useRouter } from 'next/router'
import { PropsWithChildren, useEffect } from 'react'
import { toast } from 'sonner'
import { ResponseError } from 'types'

export const RouteValidationWrapper = ({ children }: PropsWithChildren<{}>) => {
  const router = useRouter()
  const { ref, slug, id } = useParams()
  const { data: organization } = useSelectedOrganizationQuery()

  const isLoggedIn = useIsLoggedIn()
  const isUserMFAEnabled = useIsMFAEnabled()

  const { setLastVisitedSnippet, setLastVisitedTable } = useDashboardHistory()
  const [lastVisitedOrganization, setLastVisitedOrganization] = useLocalStorageQuery(
    LOCAL_STORAGE_KEYS.LAST_VISITED_ORGANIZATION,
    ''
  )

  const DEFAULT_HOME = !!lastVisitedOrganization
    ? `/org/${lastVisitedOrganization}`
    : '/organizations'

  const excemptUrls: string[] = [
    '/new/[slug]',
    '/join',
    '/sign-in',
    '/sign-up',
    '/sign-in-sso',
    '/sign-in-mfa',
    '/sign-in-partner',
    '/sign-in-fly-tos',
  ]

  function isExceptUrl() {
    return excemptUrls.includes(router?.pathname)
  }

  const { isError: isErrorProject, error: projectDetailError } = useProjectDetailQuery(
    { ref },
    { enabled: ref !== 'default' }
  )

  const { data: organizations, isSuccess: orgsInitialized } = useOrganizationsQuery({
    enabled: isLoggedIn,
  })
  const organizationsRef = useLatest(organizations)

  useEffect(() => {
    if (isExceptUrl() || !isLoggedIn) return

    if (orgsInitialized && slug) {
      const organizations = organizationsRef.current ?? []
      const isValidOrg = organizations.some((org) => org.slug === slug)

      if (!isValidOrg) {
        toast.error('You do not have access to this organization')
        router.push(`${DEFAULT_HOME}?error=org_not_found&org=${slug}`)
        return
      }
    }
  }, [orgsInitialized])

  useEffect(() => {
    if (isLoggedIn) return
    if (isExceptUrl()) return

    const asPath = router.asPath ?? ''
    const dashboardPrefix = asPath.startsWith('/dashboard') ? '/dashboard' : ''

    if (
      router.pathname === '/sign-in' ||
      router.pathname === '/sign-up' ||
      router.pathname.startsWith('/sign-in')
    ) {
      return
    }

    let pathname = location.pathname
    if (BASE_PATH) pathname = pathname.replace(BASE_PATH, '')
    const searchParams = new URLSearchParams(location.search)
    const returnTo = `${pathname}${location.search}${location.hash}`
    searchParams.set('returnTo', returnTo)
    router.push(`${dashboardPrefix}/sign-in?${searchParams.toString()}`)
  }, [isLoggedIn, router, router.asPath])

  useEffect(() => {
    if (!router.isReady) return
    if (!isLoggedIn) return
    if (ref !== 'default') return
    if (router.asPath !== DEFAULT_HOME) {
      router.replace(DEFAULT_HOME)
    }
  }, [DEFAULT_HOME, isLoggedIn, ref, router, router.asPath, router.isReady])

  useEffect(() => {
    if (isExceptUrl() || !isLoggedIn) return
    if (ref === 'default') return
    if (!ref || !isErrorProject) return

    const code =
      projectDetailError instanceof ResponseError ? projectDetailError.code : undefined

    toast.error('You do not have access to this project')
    router.push(DEFAULT_HOME)
  }, [
    DEFAULT_HOME,
    isErrorProject,
    isLoggedIn,
    projectDetailError,
    ref,
    router,
  ])

  useEffect(() => {
    if (ref !== undefined && id !== undefined) {
      if (router.pathname.endsWith('/sql/[id]') && id !== 'new') {
        setLastVisitedSnippet(id)
      } else if (router.pathname.endsWith('/editor/[id]')) {
        setLastVisitedTable(id)
      }
    }
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
  }, [organization])

  return <>{children}</>
}
