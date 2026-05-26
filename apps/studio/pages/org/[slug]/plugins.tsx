import { OrganizationPluginMarketplace } from 'components/interfaces/PluginMarketplace/OrganizationPluginMarketplace'
import DefaultLayout from 'components/layouts/DefaultLayout'
import OrganizationLayout from 'components/layouts/OrganizationLayout'
import OrganizationSettingsLayout from 'components/layouts/ProjectLayout/OrganizationSettingsLayout'
import type { NextPageWithLayout } from 'types'

const OrgPluginsPage: NextPageWithLayout = () => {
  return <OrganizationPluginMarketplace />
}

OrgPluginsPage.getLayout = (page) => (
  <DefaultLayout>
    <OrganizationLayout>
      <OrganizationSettingsLayout>{page}</OrganizationSettingsLayout>
    </OrganizationLayout>
  </DefaultLayout>
)

export default OrgPluginsPage
