import { useParams } from 'common'
import { TeamSettings } from 'components/interfaces/Organization/TeamSettings/TeamSettings'
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

  return selectedOrganization === undefined && isLoadingPermissions ? (
    <LogoLoader />
  ) : (
    <TeamSettings />
  )
}

OrgTeamSettings.getLayout = (page) => (
  <DefaultLayout>
    <OrganizationLayout>{page}</OrganizationLayout>
  </DefaultLayout>
)

export default OrgTeamSettings
