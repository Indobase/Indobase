import type { OrgProject } from 'data/projects/org-projects-infinite-query'
import { IS_SAAS } from 'lib/constants'
import { Badge } from 'ui'

/** SaaS org/home project list: data-plane provisioning state for dedicated-DB projects. */
export function DataPlaneListBadge({ project }: { project: OrgProject }) {
  if (!IS_SAAS) return null
  if (!project.has_dedicated_database) return null

  if (project.data_plane_last_provisioned_at) {
    if (project.data_plane_last_provision_ok === false) {
      return (
        <Badge variant="destructive" className="shrink-0 text-[10px] px-1.5 py-0">
          Data plane error
        </Badge>
      )
    }
    return (
      <Badge variant="success" className="shrink-0 text-[10px] px-1.5 py-0">
        Data plane
      </Badge>
    )
  }

  return (
    <Badge variant="warning" className="shrink-0 text-[10px] px-1.5 py-0">
      Provision pending
    </Badge>
  )
}
