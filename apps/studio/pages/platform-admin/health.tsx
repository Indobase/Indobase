import { PlatformAdminHealth } from 'components/interfaces/PlatformAdmin/PlatformAdminHealth'
import AppLayout from 'components/layouts/AppLayout/AppLayout'
import DefaultLayout from 'components/layouts/DefaultLayout'
import OrganizationLayout from 'components/layouts/OrganizationLayout'
import PlatformAdminLayout from 'components/layouts/PlatformAdminLayout/PlatformAdminLayout'
import type { NextPageWithLayout } from 'types'

const PlatformAdminHealthPage: NextPageWithLayout = () => {
  return <PlatformAdminHealth />
}

PlatformAdminHealthPage.getLayout = (page) => (
  <AppLayout>
    <DefaultLayout hideMobileMenu headerTitle="Platform admin">
      <OrganizationLayout>
        <PlatformAdminLayout title="Health">{page}</PlatformAdminLayout>
      </OrganizationLayout>
    </DefaultLayout>
  </AppLayout>
)

export default PlatformAdminHealthPage
