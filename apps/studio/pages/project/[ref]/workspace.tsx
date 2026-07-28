import { WorkspaceLauncher } from 'components/interfaces/ProjectExperienceChooser/WorkspaceLauncher'
import DefaultLayout from 'components/layouts/DefaultLayout'
import { ProjectLayoutWithAuth } from 'components/layouts/ProjectLayout'
import type { NextPageWithLayout } from 'types'

const WorkspacePage: NextPageWithLayout = () => {
  return <WorkspaceLauncher />
}

WorkspacePage.getLayout = (page) => (
  <DefaultLayout>
    <ProjectLayoutWithAuth>{page}</ProjectLayoutWithAuth>
  </DefaultLayout>
)

export default WorkspacePage
