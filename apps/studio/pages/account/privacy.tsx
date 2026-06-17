import { DataPrivacySettings } from 'components/interfaces/Account/Privacy/DataPrivacySettings'
import AccountLayout from 'components/layouts/AccountLayout/AccountLayout'
import AppLayout from 'components/layouts/AppLayout/AppLayout'
import DefaultLayout from 'components/layouts/DefaultLayout'
import OrganizationLayout from 'components/layouts/OrganizationLayout'
import type { NextPageWithLayout } from 'types'
import { PageContainer } from 'ui-patterns/PageContainer'
import {
  PageHeader,
  PageHeaderDescription,
  PageHeaderMeta,
  PageHeaderSummary,
  PageHeaderTitle,
} from 'ui-patterns/PageHeader'

const AccountPrivacyPage: NextPageWithLayout = () => {
  return (
    <>
      <PageHeader size="small">
        <PageHeaderMeta>
          <PageHeaderSummary>
            <PageHeaderTitle>Data &amp; privacy</PageHeaderTitle>
            <PageHeaderDescription>
              Exercise your rights under India&apos;s Digital Personal Data Protection Act (DPDP).
            </PageHeaderDescription>
          </PageHeaderSummary>
        </PageHeaderMeta>
      </PageHeader>
      <PageContainer size="small">
        <DataPrivacySettings />
      </PageContainer>
    </>
  )
}

AccountPrivacyPage.getLayout = (page) => (
  <AppLayout>
    <OrganizationLayout>
      <DefaultLayout>
        <AccountLayout title="Data & privacy">{page}</AccountLayout>
      </DefaultLayout>
    </OrganizationLayout>
  </AppLayout>
)

export default AccountPrivacyPage
