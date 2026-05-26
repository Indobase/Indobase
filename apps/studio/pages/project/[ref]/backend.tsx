import { ProjectBackendHome } from 'components/interfaces/ProjectExperienceChooser/ProjectBackendHome'
import { ProjectExperienceHeaderActions } from 'components/interfaces/ProjectExperienceChooser/ProjectExperienceHeaderActions'
import DefaultLayout from 'components/layouts/DefaultLayout'
import { ProjectLayoutWithAuth } from 'components/layouts/ProjectLayout'
import type { NextPageWithLayout } from 'types'

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
