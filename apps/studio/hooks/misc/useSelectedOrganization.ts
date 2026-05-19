import { useIsLoggedIn, useParams } from 'common'
import { useOrganizationsQuery } from 'data/organizations/organizations-query'
import { useProjectDetailQuery } from 'data/projects/project-detail-query'

export function useSelectedOrganizationQuery({ enabled = true } = {}) {
  const isLoggedIn = useIsLoggedIn()

  const { ref, slug } = useParams()
  const { data: selectedProject } = useProjectDetailQuery({ ref })

  return useOrganizationsQuery({
    enabled: isLoggedIn && enabled,
    select: (data) => {
      return data.find((org) => {
        if (slug !== undefined) return org.slug === slug
        if (selectedProject !== undefined) {
          const projectOrgSlug = (selectedProject as { organization_slug?: string })
            .organization_slug
          if (projectOrgSlug) return org.slug === projectOrgSlug
          return org.id === selectedProject.organization_id
        }
        return undefined
      })
    },
  })
}
