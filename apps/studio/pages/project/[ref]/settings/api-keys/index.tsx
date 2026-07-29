import dynamic from 'next/dynamic'
import { PermissionAction } from '@indobaseinc/shared-types/out/constants'
import { IS_SAAS, useParams } from 'common'
import {
  ApiKeysCreateCallout,
  ApiKeysFeedbackBanner,
} from 'components/interfaces/APIKeys/ApiKeysIllustrations'
import ApiKeysLayout from 'components/layouts/APIKeys/APIKeysLayout'
import { DefaultLayout } from 'components/layouts/DefaultLayout'
import SettingsLayout from 'components/layouts/ProjectSettingsLayout/SettingsLayout'
import { DisableInteraction } from 'components/ui/DisableInteraction'
import { useAPIKeysQuery } from 'data/api-keys/api-keys-query'
import { useAsyncCheckPermissions } from 'hooks/misc/useCheckPermissions'
import { useMemo } from 'react'
import type { NextPageWithLayout } from 'types'
import { Separator } from 'ui'
import { GenericSkeletonLoader } from 'ui-patterns/ShimmeringLoader'

const PublishableAPIKeys = dynamic(
  () =>
    import('components/interfaces/APIKeys/PublishableAPIKeys').then((m) => ({
      default: m.PublishableAPIKeys,
    })),
  { loading: () => <GenericSkeletonLoader /> }
)
const SecretAPIKeys = dynamic(
  () =>
    import('components/interfaces/APIKeys/SecretAPIKeys').then((m) => ({
      default: m.SecretAPIKeys,
    })),
  { loading: () => <GenericSkeletonLoader /> }
)

const ApiKeysNewPage: NextPageWithLayout = () => {
  const { ref: projectRef } = useParams()
  const { can: canReadAPIKeys } = useAsyncCheckPermissions(PermissionAction.SECRETS_READ, '*')
  const { data: apiKeysData = [] } = useAPIKeysQuery(
    {
      projectRef,
      reveal: false,
    },
    { enabled: canReadAPIKeys }
  )

  const newApiKeys = useMemo(
    () => apiKeysData.filter(({ type }) => type === 'publishable' || type === 'secret'),
    [apiKeysData]
  )
  const hasNewApiKeys = newApiKeys.length > 0
  const lockApiKeyForms = !IS_SAAS && !hasNewApiKeys

  return (
    <>
      {canReadAPIKeys && !hasNewApiKeys && <ApiKeysCreateCallout />}
      {hasNewApiKeys && <ApiKeysFeedbackBanner />}
      <DisableInteraction disabled={lockApiKeyForms} className="flex flex-col gap-8">
        <PublishableAPIKeys />
        <Separator />
        <SecretAPIKeys />
      </DisableInteraction>
    </>
  )
}

ApiKeysNewPage.getLayout = (page) => (
  <DefaultLayout>
    <SettingsLayout>
      <ApiKeysLayout>{page}</ApiKeysLayout>
    </SettingsLayout>
  </DefaultLayout>
)

export default ApiKeysNewPage
