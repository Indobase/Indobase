import { getAccessToken, LOCAL_STORAGE_KEYS } from 'common'
import { useOrganizationsQuery } from 'data/organizations/organizations-query'
import { useOrgProjectsInfiniteQuery } from 'data/projects/org-projects-infinite-query'
import { useLocalStorageQuery } from 'hooks/misc/useLocalStorage'
import { withAuth } from 'hooks/misc/withAuth'
import { useRouter } from 'next/router'
import { useEffect, useMemo, useState } from 'react'
import type { NextPageWithLayout } from 'types'
import { Button } from 'ui'

const GlobalBuilderConnectPage: NextPageWithLayout = () => {
  const router = useRouter()
  const [status, setStatus] = useState('Finding your Indobase project…')
  const [lastVisitedOrganization] = useLocalStorageQuery(
    LOCAL_STORAGE_KEYS.LAST_VISITED_ORGANIZATION,
    ''
  )

  const { data: organizations = [], isSuccess: orgsReady } = useOrganizationsQuery()
  const organizationSlug = useMemo(() => {
    if (lastVisitedOrganization) return lastVisitedOrganization
    return organizations[0]?.slug || ''
  }, [lastVisitedOrganization, organizations])

  const { data: projectsData, isSuccess: projectsReady } = useOrgProjectsInfiniteQuery(
    { slug: organizationSlug, sort: 'name_asc', search: '', statuses: [] },
    { enabled: Boolean(organizationSlug) }
  )

  const projects = useMemo(
    () => projectsData?.pages.flatMap((page) => page.projects) ?? [],
    [projectsData]
  )

  const returnTo =
    typeof router.query.return_to === 'string' ? router.query.return_to : '/'

  useEffect(() => {
    if (!router.isReady || !orgsReady) {
      return
    }

    void (async () => {
      const accessToken = await getAccessToken()
      if (!accessToken) {
        const signInReturn = `/builder/connect?return_to=${encodeURIComponent(returnTo)}`
        await router.replace(`/sign-in?returnTo=${encodeURIComponent(signInReturn)}`)
        return
      }

      if (!organizationSlug) {
        setStatus('Create or join an organization in Studio, then open Builder from a project.')
        return
      }

      if (!projectsReady) {
        return
      }

      if (projects.length === 1) {
        const projectRef = projects[0]!.ref
        setStatus('Opening Builder…')
        await router.replace(
          `/project/${encodeURIComponent(projectRef)}/builder/connect?return_to=${encodeURIComponent(returnTo)}`
        )
        return
      }

      if (projects.length === 0) {
        setStatus('Create a project in Studio first, then open Builder from the project sidebar.')
        return
      }

      setStatus('Choose a project to connect Builder.')
    })()
  }, [
    orgsReady,
    organizationSlug,
    projects,
    projectsReady,
    returnTo,
    router,
  ])

  if (projects.length > 1) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center p-8">
        <div className="w-full max-w-lg rounded-xl border border-default bg-surface-100 p-6">
          <h1 className="text-lg font-semibold text-foreground">Connect Indobase Builder</h1>
          <p className="mt-2 text-sm text-foreground-light">
            Pick the project you want Builder to use for database, auth, storage, and deploy.
          </p>
          <ul className="mt-4 space-y-2">
            {projects.map((project) => (
              <li key={project.ref}>
                <Button asChild type="default" className="w-full justify-start">
                  <a
                    href={`/project/${encodeURIComponent(project.ref)}/builder/connect?return_to=${encodeURIComponent(returnTo)}`}
                  >
                    {project.name}
                  </a>
                </Button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-[50vh] items-center justify-center p-8">
      <div className="max-w-lg rounded-xl border border-default bg-surface-100 p-6 text-center">
        <h1 className="text-lg font-semibold text-foreground">Connecting Indobase Builder</h1>
        <p className="mt-3 text-sm text-foreground-light">{status}</p>
        {organizations.length > 0 && projects.length === 0 && organizationSlug && (
          <div className="mt-4">
            <Button asChild type="default">
              <a href={`/org/${encodeURIComponent(organizationSlug)}`}>Go to projects</a>
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

export default withAuth(GlobalBuilderConnectPage)
