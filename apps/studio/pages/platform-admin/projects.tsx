import { PlatformAdminProjects } from 'components/interfaces/PlatformAdmin/PlatformAdminTables'
import AppLayout from 'components/layouts/AppLayout/AppLayout'
import DefaultLayout from 'components/layouts/DefaultLayout'
import OrganizationLayout from 'components/layouts/OrganizationLayout'
import PlatformAdminLayout from 'components/layouts/PlatformAdminLayout/PlatformAdminLayout'
import type { NextPageWithLayout } from 'types'

const PlatformAdminProjectsPage: NextPageWithLayout = () => {
  return <PlatformAdminProjects />
}

PlatformAdminProjectsPage.getLayout = (page) => (
  <AppLayout>
    <DefaultLayout hideMobileMenu headerTitle="Platform admin">
      <OrganizationLayout>
        <PlatformAdminLayout title="Projects">{page}</PlatformAdminLayout>
      </OrganizationLayout>
    </DefaultLayout>
  </AppLayout>
)

export default PlatformAdminProjectsPage
