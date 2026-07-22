import { CreditCard } from 'lucide-react'
import { Badge } from 'ui'
import { EmptyStatePresentational } from 'ui-patterns'
import { PageContainer } from 'ui-patterns/PageContainer'
import { PageSection, PageSectionContent } from 'ui-patterns/PageSection'

/**
 * Indobase Payments — in-project getting-started surface.
 * Uses the current Studio session (no separate login). Merchant KYC / checkout
 * wiring ships later; this page is the product entry from the project chooser.
 */
export const ProjectPaymentsHome = () => {
  return (
    <PageContainer size="large">
      <PageSection>
        <PageSectionContent className="flex min-h-[60vh] flex-col items-center justify-center py-16">
          <EmptyStatePresentational
            icon={<CreditCard size={28} strokeWidth={1.5} className="text-[#4F46E5]" />}
            title="Indobase Payments"
            description="Collect INR from your customers — subscriptions, invoices, and payouts — inside this project. You are already signed in with Studio; no separate Payments login."
          >
            <div className="mt-4 flex flex-col items-center gap-3">
              <Badge variant="default">Available · getting started</Badge>
              <p className="max-w-md text-center text-sm text-foreground-light">
                Merchant onboarding and live checkout come next. Settlements go to your own merchant
                account — Indobase orchestrates; it does not take custody of funds.
              </p>
            </div>
          </EmptyStatePresentational>
        </PageSectionContent>
      </PageSection>
    </PageContainer>
  )
}
