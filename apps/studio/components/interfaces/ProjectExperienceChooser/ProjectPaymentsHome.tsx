import { CreditCard, ExternalLink } from 'lucide-react'
import { Badge, Button } from 'ui'
import { EmptyStatePresentational } from 'ui-patterns'
import { PageContainer } from 'ui-patterns/PageContainer'
import { PageSection, PageSectionContent } from 'ui-patterns/PageSection'

const DEFAULT_PAYMENTS_URL = 'https://payments.indobase.in'

function getIndobasePaymentsUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_INDOBASE_PAYMENTS_URL?.trim()
  if (!fromEnv) return DEFAULT_PAYMENTS_URL
  return fromEnv.replace(/\/+$/, '')
}

/**
 * Indobase Payments — in-project getting-started surface.
 * Deep-links to the Indobase Payments app (Meteroid-derived AGPL engine).
 * Operators stay on the Studio session; SSO/handoff into Payments is follow-up.
 */
export const ProjectPaymentsHome = () => {
  const paymentsUrl = getIndobasePaymentsUrl()

  return (
    <PageContainer size="large">
      <PageSection>
        <PageSectionContent className="flex min-h-[60vh] flex-col items-center justify-center py-16">
          <EmptyStatePresentational
            icon={<CreditCard size={28} strokeWidth={1.5} className="text-[#3B8FD6]" />}
            title="Indobase Payments"
            description="Collect payments from your customers — subscriptions, invoices, and usage-based charges — with the Indobase Payments engine. You are already signed in with Studio; SSO into Payments is coming next."
          >
            <div className="mt-4 flex flex-col items-center gap-4">
              <Badge variant="default">Available · engine ready</Badge>
              <p className="max-w-md text-center text-sm text-foreground-light">
                Open Indobase Payments to manage plans, customers, and invoices. Stripe works today;
                Razorpay Recurring Payments for INR is next. Settlements go to your merchant account
                — Indobase orchestrates; it does not take custody of funds.
              </p>
              <Button asChild type="primary" icon={<ExternalLink size={14} />}>
                <a href={paymentsUrl} target="_blank" rel="noopener noreferrer">
                  Open Indobase Payments
                </a>
              </Button>
              <p className="max-w-sm text-center text-xs text-foreground-lighter">
                Same Indobase product — no separate Payments marketing brand. Studio SSO/handoff
                will replace a second login when ready.
              </p>
            </div>
          </EmptyStatePresentational>
        </PageSectionContent>
      </PageSection>
    </PageContainer>
  )
}
