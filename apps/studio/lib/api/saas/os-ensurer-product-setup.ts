/**
 * Lane 2 commerce/email: data-plane ready ≠ product live.
 * Mint handoff URLs when possible; commerce stays pending_setup until gateway keys
 * are connected (BYOK) or merchant is verified. Email stays pending until sender setup.
 */
import { enabledMessageFor, pendingMessageFor } from '@indobase/platform'

import type { Claims } from './platform'
import { getMerchantCanGoLive, getMerchantProfile, patchMerchantProfile } from './merchant-kyc'
import type { SettlementMarket } from './merchant-kyc-provider'
import { getPaymentsLaunchRedirect } from './payments-launch'
import { getEmailLaunchRedirect } from './email-launch'
import { getAnalyticsLaunchRedirect } from './analytics-launch'

export const COMMERCE_HANDOFF_FAIL_MESSAGE =
  'Payments backend is ready — finish KYC on the payment provider dashboard, paste API keys in Studio Connect gateway, then wire checkout.'

export const EMAIL_HANDOFF_FAIL_MESSAGE =
  'Email backend is ready — setup could not be linked right now. Finish sender setup from Indobase OS when you can.'

export const ANALYTICS_HANDOFF_FAIL_MESSAGE =
  'Analytics backend is ready — open Indobase Analytics to finish site setup and start tracking.'

export type ProductCapabilityEnsureResult = {
  ok: boolean
  state: 'ready' | 'pending_setup' | 'failed'
  customerMessage?: string
  launchUrl?: string | null
  setupStatus?: 'pending' | 'ready'
  detail?: string
  settlementMarket?: SettlementMarket
  settlementAdapter?: 'stripe' | 'razorpay_route'
}

/** Provider-free suffix (ensure messages must pass assertNoProviderLeak). */
function railCopy(market: SettlementMarket | undefined): string {
  if (market === 'india') return ' India settlements selected.'
  if (market === 'international') return ' International cards selected.'
  return ''
}

async function applyCommerceSettlementMarket({
  claims,
  workspaceRef,
  settlementMarket,
}: {
  claims: Claims
  workspaceRef: string
  settlementMarket?: SettlementMarket | null
}): Promise<{ settlementMarket?: SettlementMarket; settlementAdapter?: 'stripe' | 'razorpay_route' }> {
  if (settlementMarket) {
    try {
      const profile = await patchMerchantProfile({
        claims,
        ref: workspaceRef,
        patch: { settlement_market: settlementMarket },
      })
      return {
        settlementMarket: profile.settlement_market,
        settlementAdapter: profile.settlement_adapter,
      }
    } catch {
      // Profile may be locked after verify — still surface current rail below.
    }
  }

  try {
    const profile = await getMerchantProfile({ claims, ref: workspaceRef })
    return {
      settlementMarket: profile.settlement_market,
      settlementAdapter: profile.settlement_adapter,
    }
  } catch {
    return settlementMarket
      ? {
          settlementMarket,
          settlementAdapter: settlementMarket === 'india' ? 'razorpay_route' : 'stripe',
        }
      : {}
  }
}

/**
 * After data-plane is healthy: commerce becomes ready once gateway keys are connected
 * (or merchant verified); email stays pending_setup until product adapters finish.
 */
export async function finalizeProductCapabilityEnsure({
  claims,
  workspaceRef,
  capabilityId,
  settlementMarket,
}: {
  claims: Claims
  workspaceRef: string
  capabilityId: string
  settlementMarket?: SettlementMarket | null
}): Promise<ProductCapabilityEnsureResult> {
  if (capabilityId === 'commerce') {
    const rail = await applyCommerceSettlementMarket({
      claims,
      workspaceRef,
      settlementMarket,
    })
    const railSuffix = railCopy(rail.settlementMarket)

    const pending =
      (pendingMessageFor('commerce') ||
        'Payments backend is ready — finish KYC on the provider dashboard, paste API keys in Studio Connect gateway, then wire checkout.') +
      railSuffix
    const live = (enabledMessageFor('commerce') || 'Payments are live') + railSuffix

    let merchantLive = false
    try {
      merchantLive = await getMerchantCanGoLive({ claims, ref: workspaceRef })
    } catch {
      merchantLive = false
    }

    try {
      const redirect = await getPaymentsLaunchRedirect({ claims, ref: workspaceRef })
      if (merchantLive) {
        return {
          ok: true,
          state: 'ready',
          customerMessage: live,
          launchUrl: redirect.url,
          setupStatus: 'ready',
          ...rail,
        }
      }
      return {
        ok: true,
        state: 'pending_setup',
        customerMessage: pending,
        launchUrl: redirect.url,
        setupStatus: 'pending',
        ...rail,
      }
    } catch (err) {
      if (merchantLive) {
        return {
          ok: true,
          state: 'ready',
          customerMessage: live,
          launchUrl: null,
          setupStatus: 'ready',
          detail: err instanceof Error ? err.message : 'payments handoff failed',
          ...rail,
        }
      }
      return {
        ok: true,
        state: 'pending_setup',
        customerMessage: COMMERCE_HANDOFF_FAIL_MESSAGE + railSuffix,
        launchUrl: null,
        setupStatus: 'pending',
        detail: err instanceof Error ? err.message : 'payments handoff failed',
        ...rail,
      }
    }
  }

  if (capabilityId === 'email') {
    const pending =
      pendingMessageFor('email') ||
      'Email backend is ready — finish sender setup to send campaigns.'
    try {
      const redirect = await getEmailLaunchRedirect({ claims, ref: workspaceRef })
      return {
        ok: true,
        state: 'pending_setup',
        customerMessage: pending,
        launchUrl: redirect.url,
        setupStatus: 'pending',
      }
    } catch (err) {
      return {
        ok: true,
        state: 'pending_setup',
        customerMessage: EMAIL_HANDOFF_FAIL_MESSAGE,
        launchUrl: null,
        setupStatus: 'pending',
        detail: err instanceof Error ? err.message : 'email handoff failed',
      }
    }
  }

  if (capabilityId === 'events') {
    const pending =
      pendingMessageFor('events') ||
      'Analytics backend is ready — finish site setup in Indobase Analytics to track visits.'
    try {
      const redirect = await getAnalyticsLaunchRedirect({ claims, ref: workspaceRef })
      return {
        ok: true,
        state: 'pending_setup',
        customerMessage: pending,
        launchUrl: redirect.url,
        setupStatus: 'pending',
      }
    } catch (err) {
      return {
        ok: true,
        state: 'pending_setup',
        customerMessage: ANALYTICS_HANDOFF_FAIL_MESSAGE,
        launchUrl: null,
        setupStatus: 'pending',
        detail: err instanceof Error ? err.message : 'analytics handoff failed',
      }
    }
  }

  return { ok: true, state: 'ready', setupStatus: 'ready' }
}
