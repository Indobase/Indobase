import dynamic from 'next/dynamic'

import { ProjectExperienceHeaderActions } from 'components/interfaces/ProjectExperienceChooser/ProjectExperienceHeaderActions'
import DefaultLayout from 'components/layouts/DefaultLayout'
import { ProjectLayoutWithAuth } from 'components/layouts/ProjectLayout'
import { GenericSkeletonLoader } from 'ui-patterns/ShimmeringLoader'
import type { NextPageWithLayout } from 'types'

const ProjectBackendHome = dynamic(
  () =>
    import('components/interfaces/ProjectExperienceChooser/ProjectBackendHome').then((m) => ({
      default: m.ProjectBackendHome,
    })),
  { loading: () => <GenericSkeletonLoader /> }
)

const ProjectBackendPage: NextPageWithLayout = () => {
  return <ProjectBackendHome />
}

ProjectBackendPage.getLayout = (page) => (
  <DefaultLayout>
    <ProjectLayoutWithAuth
      headerTitle="Backend"
      customHeaderComponents={<ProjectExperienceHeaderActions />}
    >
      {page}
    </ProjectLayoutWithAuth>
  </DefaultLayout>
)

export default ProjectBackendPage
