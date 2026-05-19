import { PlatformAdminSupport } from 'components/interfaces/PlatformAdmin/PlatformAdminSupport'
import AppLayout from 'components/layouts/AppLayout/AppLayout'
import DefaultLayout from 'components/layouts/DefaultLayout'
import OrganizationLayout from 'components/layouts/OrganizationLayout'
import PlatformAdminLayout from 'components/layouts/PlatformAdminLayout/PlatformAdminLayout'
import type { NextPageWithLayout } from 'types'

const PlatformAdminSupportPage: NextPageWithLayout = () => {
  return <PlatformAdminSupport />
}

PlatformAdminSupportPage.getLayout = (page) => (
  <AppLayout>
    <DefaultLayout hideMobileMenu headerTitle="Platform admin">
      <OrganizationLayout>
        <PlatformAdminLayout title="Support">{page}</PlatformAdminLayout>
      </OrganizationLayout>
    </DefaultLayout>
  </AppLayout>
)

export default PlatformAdminSupportPage
