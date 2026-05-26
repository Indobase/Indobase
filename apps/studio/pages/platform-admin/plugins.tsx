import { PluginMarketplaceAdminReview } from 'components/interfaces/PluginMarketplace/PluginMarketplaceAdminReview'
import AppLayout from 'components/layouts/AppLayout/AppLayout'
import DefaultLayout from 'components/layouts/DefaultLayout'
import OrganizationLayout from 'components/layouts/OrganizationLayout'
import PlatformAdminLayout from 'components/layouts/PlatformAdminLayout/PlatformAdminLayout'
import type { NextPageWithLayout } from 'types'

const PlatformAdminPluginsPage: NextPageWithLayout = () => {
  return <PluginMarketplaceAdminReview />
}

PlatformAdminPluginsPage.getLayout = (page) => (
  <AppLayout>
    <DefaultLayout hideMobileMenu headerTitle="Platform admin">
      <OrganizationLayout>
        <PlatformAdminLayout title="Plugins">{page}</PlatformAdminLayout>
      </OrganizationLayout>
    </DefaultLayout>
  </AppLayout>
)

export default PlatformAdminPluginsPage
