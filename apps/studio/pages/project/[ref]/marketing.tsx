import { ProjectExperienceHeaderActions } from 'components/interfaces/ProjectExperienceChooser/ProjectExperienceHeaderActions'
import { ProjectMarketingHome } from 'components/interfaces/ProjectExperienceChooser/ProjectMarketingHome'
import DefaultLayout from 'components/layouts/DefaultLayout'
import { ProjectLayoutWithAuth } from 'components/layouts/ProjectLayout'
import type { NextPageWithLayout } from 'types'

const ProjectMarketingPage: NextPageWithLayout = () => {
  return <ProjectMarketingHome />
}

ProjectMarketingPage.getLayout = (page) => (
  <DefaultLayout>
    <ProjectLayoutWithAuth
      headerTitle="Indobase Marketing"
      customHeaderComponents={<ProjectExperienceHeaderActions />}
    >
      {page}
    </ProjectLayoutWithAuth>
  </DefaultLayout>
)

export default ProjectMarketingPage
