import { PluginMarketplaceDetail } from 'components/interfaces/PluginMarketplace/PluginMarketplaceDetail'
import AppLayout from 'components/layouts/AppLayout/AppLayout'
import DefaultLayout from 'components/layouts/DefaultLayout'
import type { NextPageWithLayout } from 'types'

const PluginDetailPage: NextPageWithLayout = () => {
  return <PluginMarketplaceDetail />
}

PluginDetailPage.getLayout = (page) => (
  <AppLayout>
    <DefaultLayout>{page}</DefaultLayout>
  </AppLayout>
)

export default PluginDetailPage
