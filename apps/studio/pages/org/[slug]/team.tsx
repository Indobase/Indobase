import { useParams } from 'common'
import { SaasTeamSettings } from 'components/interfaces/SaasTeamSettings/SaasTeamSettings'
import DefaultLayout from 'components/layouts/DefaultLayout'
import OrganizationLayout from 'components/layouts/OrganizationLayout'
import { UnknownInterface } from 'components/ui/UnknownInterface'
import { usePermissionsQuery } from 'data/permissions/permissions-query'
import { useSelectedOrganizationQuery } from 'hooks/misc/useSelectedOrganization'
import { IS_SAAS } from 'lib/constants'
import type { NextPageWithLayout } from 'types'
import { LogoLoader } from 'ui'

const OrgTeamSettings: NextPageWithLayout = () => {
  const { slug } = useParams()
  const { isPending: isLoadingPermissions } = usePermissionsQuery()
  const { data: selectedOrganization } = useSelectedOrganizationQuery()

  if (!IS_SAAS) {
    return <UnknownInterface urlBack={`/org/${slug ?? '_'}`} />
  }

  if (selectedOrganization === undefined) {
    return <LogoLoader />
  }

  // If the org slug is invalid or user lacks access, the OrganizationLayout/RouteValidation should handle redirect,
  // but we still guard against rendering a broken page.
  if (slug && selectedOrganization.slug !== slug) {
    return <LogoLoader />
  }

  return <SaasTeamSettings />
}

OrgTeamSettings.getLayout = (page) => (
  <DefaultLayout>
    <OrganizationLayout>{page}</OrganizationLayout>
  </DefaultLayout>
)

export default OrgTeamSettings
