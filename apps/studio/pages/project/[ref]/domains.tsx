import { ProjectDomainsHome } from 'components/interfaces/ProjectExperienceChooser/ProjectDomainsHome'
import { ProjectExperienceHeaderActions } from 'components/interfaces/ProjectExperienceChooser/ProjectExperienceHeaderActions'
import DefaultLayout from 'components/layouts/DefaultLayout'
import { ProjectLayoutWithAuth } from 'components/layouts/ProjectLayout'
import { ECOSYSTEM_PRODUCTS } from 'lib/constants/ecosystem-products'
import type { NextPageWithLayout } from 'types'

const ProjectDomainsPage: NextPageWithLayout = () => {
  return <ProjectDomainsHome />
}

ProjectDomainsPage.getLayout = (page) => (
  <DefaultLayout>
    <ProjectLayoutWithAuth
      headerTitle={ECOSYSTEM_PRODUCTS.domains.name}
      customHeaderComponents={<ProjectExperienceHeaderActions />}
    >
      {page}
    </ProjectLayoutWithAuth>
  </DefaultLayout>
)

export default ProjectDomainsPage
