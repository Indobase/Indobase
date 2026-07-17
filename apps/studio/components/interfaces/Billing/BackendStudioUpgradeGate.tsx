import { UpgradePlanButton } from 'components/ui/UpgradePlanButton'
import { BuilderLaunchButton } from 'components/interfaces/ProjectExperienceChooser/BuilderLaunchButton'
import { useBackendStudioAccess } from 'hooks/misc/useBackendStudioAccess'
import Link from 'next/link'
import { PropsWithChildren } from 'react'
import { Button } from 'ui'
import { EmptyStatePresentational } from 'ui-patterns'
import { PageContainer } from 'ui-patterns/PageContainer'
import { PageSection, PageSectionContent } from 'ui-patterns/PageSection'

/**
 * Free plan cannot open backend Studio. Basic+ can.
 * Opening Studio on Free must prompt an upgrade to Basic.
 */
export function BackendStudioUpgradeGate({ children }: PropsWithChildren) {
  const { enabled, isLoading, hasAccess, organization, planName, billingHref } =
    useBackendStudioAccess()

  if (!enabled || hasAccess) {
    return <>{children}</>
  }

  if (isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center p-8">
        <div className="h-40 w-full max-w-lg animate-pulse rounded-xl bg-surface-200" />
      </div>
    )
  }

  return (
    <PageContainer>
      <PageSection>
        <PageSectionContent className="flex min-h-[60vh] flex-col items-center justify-center">
          <EmptyStatePresentational
            title="Studio is locked on Free"
            description={`${planName} still runs your app on an Indobase backend via Builder, but you cannot open Studio to inspect Auth, Database, Storage, or Edge Functions. Upgrade to Basic to unlock Studio.`}
          >
            <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
              <BuilderLaunchButton type="primary" nextPath="/?source=studio-gate">
                Open Builder
              </BuilderLaunchButton>
              <UpgradePlanButton
                source="backendStudioGate"
                plan="Basic"
                featureProposition="open Studio and manage your backend"
              >
                Upgrade to Basic — ₹499/mo
              </UpgradePlanButton>
              <Button asChild type="default">
                <Link href={billingHref}>View plans</Link>
              </Button>
              <Button asChild type="text">
                <Link href={organization?.slug ? `/org/${organization.slug}` : '/organizations'}>
                  Back to organization
                </Link>
              </Button>
            </div>
            <p className="mt-6 max-w-md text-center text-sm text-foreground-light">
              Free → Basic unlocks Studio (and a custom domain). Basic → Pro buys headroom — more
              apps, larger DB, and GitHub export.
            </p>
          </EmptyStatePresentational>
        </PageSectionContent>
      </PageSection>
    </PageContainer>
  )
}
