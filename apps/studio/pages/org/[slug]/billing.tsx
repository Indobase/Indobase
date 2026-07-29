import dynamic from 'next/dynamic'
import { useEffect } from 'react'

import { useParams } from 'common'
import DefaultLayout from 'components/layouts/DefaultLayout'
import OrganizationLayout from 'components/layouts/OrganizationLayout'
import { UnknownInterface } from 'components/ui/UnknownInterface'
import { useIsFeatureEnabled } from 'hooks/misc/useIsFeatureEnabled'
import {
  ORG_SETTINGS_PANEL_KEYS,
  useOrgSettingsPageStateSnapshot,
} from 'state/organization-settings'
import { IS_SAAS } from 'lib/constants'
import type { NextPageWithLayout } from 'types'
import { GenericSkeletonLoader } from 'ui-patterns/ShimmeringLoader'

const BillingSettings = dynamic(
  () =>
    import('components/interfaces/Organization/BillingSettings/BillingSettings').then((m) => ({
      default: m.BillingSettings,
    })),
  { loading: () => <GenericSkeletonLoader /> }
)

const OrgBillingSettings: NextPageWithLayout = () => {
  const { panel, slug } = useParams()
  const snap = useOrgSettingsPageStateSnapshot()

  const showBilling = useIsFeatureEnabled('billing:all')

  // All hooks must run unconditionally before any early return (rules-of-hooks).
  useEffect(() => {
    const allowedValues = ['subscriptionPlan', 'costControl']
    if (panel && typeof panel === 'string' && allowedValues.includes(panel)) {
      snap.setPanelKey(panel as ORG_SETTINGS_PANEL_KEYS)
      document.getElementById('billing-page-top')?.scrollIntoView({ behavior: 'smooth' })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panel])

  if (!IS_SAAS) {
    return <UnknownInterface urlBack={`/org/${slug}`} />
  }

  if (!showBilling) {
    return <UnknownInterface urlBack={`/org/${slug}`} />
  }

  return <BillingSettings />
}

OrgBillingSettings.getLayout = (page) => (
  <DefaultLayout>
    <OrganizationLayout>{page}</OrganizationLayout>
  </DefaultLayout>
)
export default OrgBillingSettings
