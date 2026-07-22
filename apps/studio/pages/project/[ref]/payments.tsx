import { ProjectExperienceHeaderActions } from 'components/interfaces/ProjectExperienceChooser/ProjectExperienceHeaderActions'
import { ProjectPaymentsHome } from 'components/interfaces/ProjectExperienceChooser/ProjectPaymentsHome'
import DefaultLayout from 'components/layouts/DefaultLayout'
import { ProjectLayoutWithAuth } from 'components/layouts/ProjectLayout'
import type { NextPageWithLayout } from 'types'

const ProjectPaymentsPage: NextPageWithLayout = () => {
  return <ProjectPaymentsHome />
}

ProjectPaymentsPage.getLayout = (page) => (
  <DefaultLayout>
    <ProjectLayoutWithAuth
      headerTitle="Indobase Payments"
      customHeaderComponents={<ProjectExperienceHeaderActions />}
    >
      {page}
    </ProjectLayoutWithAuth>
  </DefaultLayout>
)

export default ProjectPaymentsPage
