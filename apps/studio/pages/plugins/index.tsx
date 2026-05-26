import { PluginMarketplaceList } from 'components/interfaces/PluginMarketplace/PluginMarketplaceList'
import AppLayout from 'components/layouts/AppLayout/AppLayout'
import DefaultLayout from 'components/layouts/DefaultLayout'
import type { NextPageWithLayout } from 'types'

const PluginsMarketplacePage: NextPageWithLayout = () => {
  return <PluginMarketplaceList />
}

PluginsMarketplacePage.getLayout = (page) => (
  <AppLayout>
    <DefaultLayout>{page}</DefaultLayout>
  </AppLayout>
)

export default PluginsMarketplacePage
