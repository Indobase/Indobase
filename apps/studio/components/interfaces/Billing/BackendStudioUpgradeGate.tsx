import { UpgradePlanButton } from 'components/ui/UpgradePlanButton'
import { useBackendStudioAccess } from 'hooks/misc/useBackendStudioAccess'
import Link from 'next/link'
import { PropsWithChildren } from 'react'
import { Button } from 'ui'
import { EmptyStatePresentational } from 'ui-patterns'
import { PageContainer } from 'ui-patterns/PageContainer'
import { PageSection, PageSectionContent } from 'ui-patterns/PageSection'

/**
 * Free & Basic plans are frontend-only. Opening Studio (Auth, Database, etc.)
 * must prompt an upgrade to Pro — not silently allow access.
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
            title="Studio is locked on your plan"
            description={`${planName} includes Builder and published apps, but not backend Studio (Auth, Database, Storage, and Edge Functions). Upgrade to Pro to unlock Studio.`}
          >
            <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
              <UpgradePlanButton
                source="backendStudioGate"
                plan="Pro"
                featureProposition="unlock backend Studio"
              >
                Upgrade to Pro — ₹1,999/mo
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
              Free → Basic is for a custom domain and no badge. Basic → Pro unlocks Studio when you
              need users to sign in.
            </p>
          </EmptyStatePresentational>
        </PageSectionContent>
      </PageSection>
    </PageContainer>
  )
}
