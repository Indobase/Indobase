import { useParams } from 'common'
import { IntegrationSettings } from 'components/interfaces/Organization/IntegrationSettings/IntegrationSettings'
import DefaultLayout from 'components/layouts/DefaultLayout'
import OrganizationLayout from 'components/layouts/OrganizationLayout'
import { UnknownInterface } from 'components/ui/UnknownInterface'
import { IS_SAAS } from 'lib/constants'
import type { NextPageWithLayout } from 'types'

const OrgIntegrationSettings: NextPageWithLayout = () => {
  const { slug } = useParams()
  if (!IS_SAAS) {
    return <UnknownInterface urlBack={`/org/${slug ?? '_'}`} />
  }
  return <IntegrationSettings />
}

OrgIntegrationSettings.getLayout = (page) => (
  <DefaultLayout>
    <OrganizationLayout>{page}</OrganizationLayout>
  </DefaultLayout>
)

export default OrgIntegrationSettings
