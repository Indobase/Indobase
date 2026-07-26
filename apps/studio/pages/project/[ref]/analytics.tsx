import { ProjectExperienceHeaderActions } from 'components/interfaces/ProjectExperienceChooser/ProjectExperienceHeaderActions'
import { ProjectAnalyticsHome } from 'components/interfaces/ProjectExperienceChooser/ProjectAnalyticsHome'
import DefaultLayout from 'components/layouts/DefaultLayout'
import { ProjectLayoutWithAuth } from 'components/layouts/ProjectLayout'
import type { NextPageWithLayout } from 'types'

const ProjectAnalyticsPage: NextPageWithLayout = () => {
  return <ProjectAnalyticsHome />
}

ProjectAnalyticsPage.getLayout = (page) => (
  <DefaultLayout>
    <ProjectLayoutWithAuth
      headerTitle="Indobase Analytics"
      customHeaderComponents={<ProjectExperienceHeaderActions />}
    >
      {page}
    </ProjectLayoutWithAuth>
  </DefaultLayout>
)

export default ProjectAnalyticsPage
