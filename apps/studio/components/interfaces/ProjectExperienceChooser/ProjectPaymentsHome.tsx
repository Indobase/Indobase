import {
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  Loader2,
  ShieldCheck,
} from 'lucide-react'
import { useParams } from 'common'
import { useState } from 'react'

import { useMerchantProfileQuery } from 'data/payments/merchant-profile-query'
import type { MerchantKycStatus } from 'lib/api/saas/merchant-kyc-types'
import { Button, cn } from 'ui'

import { MerchantKycOnboarding } from './MerchantKycOnboarding'
import { usePaymentsLaunch } from './usePaymentsLaunch'

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
 * Indobase Payments project hub: soft-gated merchant KYC + SSO into the Payments product.
 *
 * - Browse / open Payments dashboard: always available (billing UI, plans, invoices).
 * - Go live / collect payments: requires verified merchant KYC.
 */
export const ProjectPaymentsHome = () => {
  const { ref } = useParams()
  const { launch, isLaunching } = usePaymentsLaunch()
  const { data, isLoading, error, refetch, isFetching } = useMerchantProfileQuery({
    projectRef: ref,
  })
  const [launchError, setLaunchError] = useState<string | null>(null)

  const merchant = data?.merchant
  const verified = merchant?.can_go_live === true

  const openPayments = async (mode: 'same-tab' | 'new-tab') => {
    setLaunchError(null)
    const url = await launch()
    if (!url) {
      setLaunchError('Could not start Indobase Payments session')
      return
    }
    if (mode === 'new-tab') {
      window.open(url, '_blank', 'noopener,noreferrer')
      return
    }
    window.location.assign(url)
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
            <p className="font-medium text-foreground">Complete merchant onboarding</p>
            <p className="text-foreground-light">
              KYC status: <span className="text-foreground">{statusLabel(merchant.kyc_status)}</span>.
              You can browse the Payments dashboard now. Going live to collect payments requires a
              verified merchant profile.
            </p>
          </div>
        </div>
      ) : (
        <div className="flex gap-3 rounded-md border border-brand bg-brand/10 px-4 py-3">
          <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-brand" />
          <div className="space-y-1 text-sm">
            <p className="font-medium text-foreground">Merchant verified</p>
            <p className="text-foreground-light">
              You can go live and collect payments. Settlements target your linked bank account
              {merchant.bank_account_masked ? ` (${merchant.bank_account_masked})` : ''}.
            </p>
          </div>
        </div>
      )}

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
        <div className="rounded-md border border-border px-4 py-3 text-sm text-foreground-light">
          Your merchant KYC is {statusLabel(merchant.kyc_status).toLowerCase()}.
          {merchant.aggregator_account_id
            ? ` Aggregator account id: ${merchant.aggregator_account_id}.`
            : ''}{' '}
          You can still browse the Payments dashboard while review completes.
        </div>
      )}

      <MerchantKycOnboarding
        projectRef={ref}
        merchant={merchant}
        readOnly={
          merchant.kyc_status === 'submitted' ||
          merchant.kyc_status === 'under_review' ||
          merchant.kyc_status === 'verified'
        }
      />
    </div>
  )
}
