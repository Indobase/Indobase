import {
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  Loader2,
  ShieldCheck,
} from 'lucide-react'
import { useParams } from 'common'
import { useCallback, useState } from 'react'

import { useMerchantProfileQuery } from 'data/payments/merchant-profile-query'
import { useMerchantProfileReviewMutation } from 'data/payments/merchant-profile-mutation'
import type { MerchantKycStatus } from 'lib/api/saas/merchant-kyc-types'
import { isPaymentsRoleDeniedMessage } from 'lib/api/saas/payments-launch-shared'
import { Button, cn } from 'ui'
import { Admonition } from 'ui-patterns/admonition'
import { toast } from 'sonner'

import { MerchantGatewaySetup } from './MerchantGatewaySetup'
import { MerchantKycOnboarding } from './MerchantKycOnboarding'
import { usePaymentsLaunch } from './usePaymentsLaunch'
import { resetAutoLaunch, useAutoLaunchProduct } from './useAutoLaunchProduct'

function statusLabel(status: MerchantKycStatus): string {
  switch (status) {
    case 'draft':
      return 'Draft'
    case 'submitted':
      return 'Submitted'
    case 'under_review':
      return 'Under review'
    case 'verified':
      return 'Verified'
    case 'rejected':
      return 'Rejected'
    default:
      return status
  }
}

/**
 * Indobase Payments project hub: BYOK gateway keys + SSO into the Payments product.
 *
 * - Browse / open Payments dashboard: org owner, admin, developer, or viewer.
 * - Connect gateway (paste Razorpay/Stripe keys): owner/admin only.
 * - Go live / collect payments: keys validated (or legacy verified KYC).
 */
export const ProjectPaymentsHome = () => {
  const { ref } = useParams()
  const { launch, isLaunching } = usePaymentsLaunch()
  const { data, isLoading, error, refetch, isFetching } = useMerchantProfileQuery({
    projectRef: ref,
  })
  const { mutateAsync: reviewMerchant, isPending: isReviewing } = useMerchantProfileReviewMutation()
  const [launchError, setLaunchError] = useState<string | null>(null)
  const [launchDenied, setLaunchDenied] = useState(false)

  const merchant = data?.merchant
  const accessDenied =
    launchDenied ||
    (!!error && isPaymentsRoleDeniedMessage(error.message))
  const verified = merchant?.can_go_live === true
  const canEditKyc = merchant?.can_edit_merchant_kyc === true
  const canConfirmGoLive = merchant?.can_confirm_go_live === true

  const confirmGoLive = async () => {
    if (!ref) return
    try {
      await reviewMerchant({ projectRef: ref, action: 'verify' })
      toast.success('Merchant verified — you can go live')
    } catch {
      // toast handled by mutation default onError
    }
  }

  const openPayments = useCallback(async (mode: 'same-tab' | 'new-tab') => {
    // Manual open: clear the per-tab opt-out so a later visit auto-opens again.
    resetAutoLaunch('payments', ref)
    setLaunchError(null)
    setLaunchDenied(false)
    const result = await launch()
    if (!result.ok) {
      if (result.denied) {
        setLaunchDenied(true)
        setLaunchError(result.message)
        return
      }
      setLaunchError(result.message || 'Could not start Indobase Payments session')
      return
    }
    if (mode === 'new-tab') {
      window.open(result.url, '_blank', 'noopener,noreferrer')
      return
    }
    window.location.assign(result.url)
  }, [launch, ref])

  /*
   * Skip the interstitial and go straight to Payments. Recorded per tab, so Back lands here and
   * shows the setup page rather than bouncing the user straight back out.
   */
  const { isAutoLaunching } = useAutoLaunchProduct({
    product: 'payments',
    projectRef: ref,
    launch: () => openPayments('same-tab'),
  })

  if (isAutoLaunching) {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-2 px-6 text-center">
        <p className="text-sm text-foreground">Opening Indobase Payments…</p>
        <p className="text-xs text-foreground-light">Signing you in with your Studio session.</p>
      </div>
    )
  }

  if (!ref) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center px-6">
        <p className="text-sm text-foreground-light">Project ref is required</p>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 px-6">
        <Loader2 className="h-6 w-6 animate-spin text-foreground-light" aria-hidden />
        <p className="text-sm text-foreground-light">Loading Indobase Payments…</p>
      </div>
    )
  }

  if (accessDenied) {
    return (
      <div className="mx-auto flex w-full max-w-lg flex-col gap-4 px-6 py-16">
        <Admonition
          type="warning"
          title="Ask an organization owner or admin"
          description="You do not have access to Indobase Payments for this project. Ask an owner or admin to add you as a member (developer or viewer is enough to open the dashboard)."
        />
        <Button type="default" loading={isFetching} onClick={() => refetch()}>
          Retry
        </Button>
      </div>
    )
  }

  if (error || !merchant) {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-4 px-6">
        <p className="text-sm text-foreground-light">
          {error?.message || 'Could not load merchant profile'}
        </p>
        <Button type="default" loading={isFetching} onClick={() => refetch()}>
          Retry
        </Button>
      </div>
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-6 py-10">
      <header className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-wide text-foreground-lighter">
          Indobase Payments
        </p>
        <h1 className="text-xl font-medium text-foreground">Collect payments from your customers</h1>
        <p className="max-w-2xl text-sm text-foreground-light">
          Plans, invoices, and metering run in Indobase Payments. Settlements go to your own
          merchant bank account through a licensed aggregator — Indobase orchestrates billing and
          does not take custody of funds.
        </p>
      </header>

      <section className="rounded-md border border-border px-4 py-3 text-sm">
        <p className="font-medium text-foreground">Project ↔ Payments tenant</p>
        <dl className="mt-2 grid gap-1 text-foreground-light sm:grid-cols-[10rem_1fr]">
          <dt className="text-foreground-lighter">Studio project</dt>
          <dd className="font-mono text-xs text-foreground">{merchant.project_ref}</dd>
          <dt className="text-foreground-lighter">Studio organization</dt>
          <dd className="font-mono text-xs text-foreground">
            {merchant.organization_slug || '—'}
          </dd>
          <dt className="text-foreground-lighter">Payments tenant</dt>
          <dd className="font-mono text-xs text-foreground">
            {merchant.payments_tenant_slug || '—'}
          </dd>
        </dl>
        <p className="mt-2 text-xs text-foreground-lighter">
          Mapping: Studio org slug → Payments tenant{' '}
          <code className="text-foreground">{'ib-{slug}'}</code>.
        </p>
      </section>

      <section className="rounded-md border border-border px-4 py-3 text-sm">
        <p className="font-medium text-foreground">Settlement rail</p>
        <dl className="mt-2 grid gap-1 text-foreground-light sm:grid-cols-[10rem_1fr]">
          <dt className="text-foreground-lighter">Market</dt>
          <dd className="text-foreground">
            {merchant.settlement_market === 'india'
              ? 'India settlements'
              : 'International cards'}
          </dd>
          <dt className="text-foreground-lighter">Country</dt>
          <dd className="font-mono text-xs text-foreground">{merchant.business_country || '—'}</dd>
        </dl>
        <p className="mt-2 text-xs text-foreground-lighter">
          Chosen when connecting the gateway. Finish KYC on Razorpay (India) or Stripe
          (international), then paste API keys below so agents can wire checkout.
        </p>
      </section>

      {!verified ? (
        <div
          className={cn(
            'flex gap-3 rounded-md border px-4 py-3',
            merchant.kyc_status === 'rejected'
              ? 'border-destructive-400 bg-destructive-200/15'
              : 'border-warning-500 bg-warning-200/10'
          )}
        >
          <AlertCircle
            size={18}
            className={cn(
              'mt-0.5 shrink-0',
              merchant.kyc_status === 'rejected' ? 'text-destructive' : 'text-warning'
            )}
          />
          <div className="space-y-1 text-sm">
            <p className="font-medium text-foreground">Connect your payment gateway</p>
            <p className="text-foreground-light">
              Complete KYC on Razorpay or Stripe, then paste API keys in Connect gateway. You can
              browse the Payments dashboard now; collecting payments needs validated keys.
            </p>
          </div>
        </div>
      ) : (
        <div className="flex gap-3 rounded-md border border-brand bg-brand/10 px-4 py-3">
          <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-brand" />
          <div className="space-y-1 text-sm">
            <p className="font-medium text-foreground">
              {merchant.gateway_keys_configured ? 'Gateway keys connected' : 'Merchant verified'}
            </p>
            <p className="text-foreground-light">
              You can go live and collect payments. Ask an agent to wire checkout into your site, or
              open the Payments dashboard to manage connectors.
            </p>
          </div>
        </div>
      )}

      <MerchantGatewaySetup
        projectRef={ref}
        merchant={merchant}
        readOnly={!canEditKyc}
      />

      <section className="flex flex-col gap-3 rounded-md border border-border p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <p className="text-sm font-medium text-foreground">Payments dashboard</p>
          <p className="text-xs text-foreground-lighter">
            Same Studio login — opens Indobase Payments via secure handoff.
          </p>
          {launchError ? <p className="text-xs text-destructive">{launchError}</p> : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="default"
            icon={<ExternalLink size={14} />}
            loading={isLaunching}
            onClick={() => openPayments('same-tab')}
          >
            Open dashboard
          </Button>
          <Button
            type="primary"
            icon={<ShieldCheck size={14} />}
            disabled={!verified}
            loading={isLaunching && verified}
            onClick={() => openPayments('same-tab')}
          >
            Go live / collect payments
          </Button>
        </div>
      </section>

      {(merchant.kyc_status === 'submitted' || merchant.kyc_status === 'under_review') && (
        <div className="space-y-3 rounded-md border border-border px-4 py-3 text-sm text-foreground-light">
          <p>
            Your merchant KYC is {statusLabel(merchant.kyc_status).toLowerCase()}.
            {merchant.aggregator_account_id
              ? ` Settlement account id: ${merchant.aggregator_account_id}.`
              : ''}{' '}
            You can still browse the Payments dashboard while review completes.
          </p>
          {merchant.aggregator_message ? (
            <p className="text-xs text-foreground-lighter">{merchant.aggregator_message}</p>
          ) : null}
          {merchant.settlement_market === 'india' && merchant.route_activation_status ? (
            <p className="text-xs text-foreground-lighter">
              India Route activation: {merchant.route_activation_status}
              {merchant.route_product_id ? ` (product ${merchant.route_product_id})` : ''}.
            </p>
          ) : null}
          {merchant.onboarding_url ? (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-foreground-lighter">
                Finish international card onboarding (Stripe hosted Account Link), then return here
                and Confirm go-live.
              </p>
              <Button
                type="default"
                icon={<ExternalLink size={14} />}
                onClick={() => {
                  window.open(merchant.onboarding_url!, '_blank', 'noopener,noreferrer')
                }}
              >
                Continue card onboarding
              </Button>
            </div>
          ) : null}
          {canConfirmGoLive ? (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-foreground-lighter">
                {merchant.settlement_market === 'india'
                  ? 'After confirming go-live, India settlements use your Route Linked Account + bank details submitted during KYC.'
                  : 'After confirming go-live, finish international card settlement in Indobase Payments (Checkout Sessions + webhook) so invoices settle when charges succeed.'}
              </p>
              <Button
                type="primary"
                loading={isReviewing}
                onClick={() => void confirmGoLive()}
              >
                Confirm go-live
              </Button>
            </div>
          ) : null}
        </div>
      )}

      {!canEditKyc ? (
        <Admonition
          type="note"
          title="Ask an admin to connect the payment gateway"
          description="Pasting Razorpay or Stripe API keys is limited to organization owners and admins. You can still open the Payments dashboard."
        />
      ) : null}

      {/* Legacy Studio KYC form — optional; preferred path is Connect gateway (BYOK). */}
      {!merchant.gateway_keys_configured ? (
        <details className="rounded-md border border-border p-4">
          <summary className="cursor-pointer text-sm font-medium text-foreground">
            Advanced: Studio merchant profile (optional)
          </summary>
          <p className="mb-3 mt-2 text-xs text-foreground-lighter">
            Prefer completing KYC on Razorpay/Stripe and pasting API keys above. This form is only
            needed for legacy platform onboarding.
          </p>
          <MerchantKycOnboarding
            projectRef={ref}
            merchant={merchant}
            readOnly={
              !canEditKyc ||
              merchant.kyc_status === 'submitted' ||
              merchant.kyc_status === 'under_review' ||
              merchant.kyc_status === 'verified'
            }
          />
        </details>
      ) : null}
    </div>
  )
}
