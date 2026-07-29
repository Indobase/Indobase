import dynamic from 'next/dynamic'

import { ProjectExperienceHeaderActions } from 'components/interfaces/ProjectExperienceChooser/ProjectExperienceHeaderActions'
import DefaultLayout from 'components/layouts/DefaultLayout'
import { ProjectLayoutWithAuth } from 'components/layouts/ProjectLayout'
import { GenericSkeletonLoader } from 'ui-patterns/ShimmeringLoader'
import type { NextPageWithLayout } from 'types'

const ProjectAnalyticsHome = dynamic(
  () =>
    import('components/interfaces/ProjectExperienceChooser/ProjectAnalyticsHome').then((m) => ({
      default: m.ProjectAnalyticsHome,
    })),
  { loading: () => <GenericSkeletonLoader /> }
)

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
