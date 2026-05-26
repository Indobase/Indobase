import { ProjectExperienceChooser } from 'components/interfaces/ProjectExperienceChooser/ProjectExperienceChooser'
import DefaultLayout from 'components/layouts/DefaultLayout'
import { ProjectLayoutWithAuth } from 'components/layouts/ProjectLayout'
import type { NextPageWithLayout } from 'types'

const HomePage: NextPageWithLayout = () => {
  return <ProjectExperienceChooser />
}

HomePage.getLayout = (page) => (
  <DefaultLayout>
    <ProjectLayoutWithAuth>{page}</ProjectLayoutWithAuth>
  </DefaultLayout>
)

export default HomePage
