import type { OrgProject } from 'data/projects/org-projects-infinite-query'

/** Dedicated tenant stack failed its last provision attempt — do not show a healthy project badge. */
export function projectHasDataPlaneError(project: Pick<OrgProject, 'has_dedicated_database' | 'data_plane_last_provisioned_at' | 'data_plane_last_provision_ok'>) {
  return (
    Boolean(project.has_dedicated_database) &&
    Boolean(project.data_plane_last_provisioned_at) &&
    project.data_plane_last_provision_ok === false
  )
}
