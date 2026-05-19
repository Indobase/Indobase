import Head from 'next/head'
import { useRouter } from 'next/router'
import { PropsWithChildren } from 'react'

import { useCustomContent } from 'hooks/custom-content/useCustomContent'
import { useIsPlatformOperator } from 'hooks/misc/useIsPlatformOperator'
import { withAuth } from 'hooks/misc/withAuth'
import Link from 'next/link'
import { Button, cn } from 'ui'
import { PageContainer } from 'ui-patterns/PageContainer'
import {
  PageHeader,
  PageHeaderDescription,
  PageHeaderSummary,
  PageHeaderTitle,
} from 'ui-patterns/PageHeader'
import { WithSidebar } from '../AccountLayout/WithSidebar'

export interface PlatformAdminLayoutProps {
  title: string
}

const PlatformAdminLayout = ({ children, title }: PropsWithChildren<PlatformAdminLayoutProps>) => {
  const router = useRouter()
  const currentPath = router.pathname
  const { appTitle } = useCustomContent(['app:title'])
  const titleSuffix = appTitle || 'Indobase'
  const { isPlatformOperator, isLoading } = useIsPlatformOperator()

  const navLinks = [
    { key: 'overview', label: 'Overview', href: '/platform-admin' },
    { key: 'organizations', label: 'Organizations', href: '/platform-admin/organizations' },
    { key: 'projects', label: 'Projects', href: '/platform-admin/projects' },
    { key: 'users', label: 'Users', href: '/platform-admin/users' },
    { key: 'audit', label: 'Audit logs', href: '/platform-admin/audit' },
  ]

  return (
    <>
      <Head>
        <title>
          {title} | Platform admin | {titleSuffix}
        </title>
        <meta name="description" content="Indobase platform administration" />
      </Head>
      <div className={cn('flex flex-col w-screen h-[calc(100vh-48px)]')}>
        <WithSidebar
          title=""
          breadcrumbs={[]}
          backToDashboardURL="/organizations"
          sections={[
            {
              key: 'platform-admin',
              heading: 'Platform admin',
              links: navLinks.map(({ key, label, href }) => ({
                key,
                label,
                href,
                isActive: currentPath === href,
              })),
            },
          ]}
        >
          {isLoading ? (
            <PageContainer className="py-8">
              <p className="text-sm text-foreground-light">Checking access…</p>
            </PageContainer>
          ) : !isPlatformOperator ? (
            <PageContainer className="py-8 max-w-lg">
              <PageHeader>
                <PageHeaderSummary>
                  <PageHeaderTitle>Access denied</PageHeaderTitle>
                  <PageHeaderDescription>
                    Platform admin is restricted to operators listed in{' '}
                    <code className="text-code-inline">PLATFORM_OPERATOR_EMAILS</code> or{' '}
                    <code className="text-code-inline">PLATFORM_OPERATOR_GOTRUE_IDS</code> on the
                    Studio server.
                  </PageHeaderDescription>
                </PageHeaderSummary>
              </PageHeader>
              <Button type="default" asChild className="mt-4">
                <Link href="/organizations">Back to organizations</Link>
              </Button>
            </PageContainer>
          ) : (
            children
          )}
        </WithSidebar>
      </div>
    </>
  )
}

export default withAuth(PlatformAdminLayout)
