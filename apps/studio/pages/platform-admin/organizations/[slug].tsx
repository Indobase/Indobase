import { PlatformAdminOrganizationDetail } from 'components/interfaces/PlatformAdmin/PlatformAdminOrganizationDetail'
import AppLayout from 'components/layouts/AppLayout/AppLayout'
import DefaultLayout from 'components/layouts/DefaultLayout'
import OrganizationLayout from 'components/layouts/OrganizationLayout'
import PlatformAdminLayout from 'components/layouts/PlatformAdminLayout/PlatformAdminLayout'
import type { NextPageWithLayout } from 'types'

const PlatformAdminOrganizationPage: NextPageWithLayout = () => {
  return <PlatformAdminOrganizationDetail />
}

PlatformAdminOrganizationPage.getLayout = (page) => (
  <AppLayout>
    <DefaultLayout hideMobileMenu headerTitle="Platform admin">
      <OrganizationLayout>
        <PlatformAdminLayout title="Organization">{page}</PlatformAdminLayout>
      </OrganizationLayout>
    </DefaultLayout>
  </AppLayout>
)

export default PlatformAdminOrganizationPage
