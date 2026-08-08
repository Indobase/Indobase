/**
 * Lane 2 commerce/email: data-plane ready ≠ product live.
 * Mint handoff URLs when possible; always return pending_setup until checkout/sender done.
 */
import { pendingMessageFor } from '@indobase/platform'

import type { Claims } from './platform'
import { getPaymentsLaunchRedirect } from './payments-launch'
import { getEmailLaunchRedirect } from './email-launch'

export const COMMERCE_HANDOFF_FAIL_MESSAGE =
  'Payments backend is ready — setup could not be linked right now. Finish checkout setup from Indobase OS when you can.'

export const EMAIL_HANDOFF_FAIL_MESSAGE =
  'Email backend is ready — setup could not be linked right now. Finish sender setup from Indobase OS when you can.'

export type ProductCapabilityEnsureResult = {
  ok: boolean
  state: 'ready' | 'pending_setup' | 'failed'
  customerMessage?: string
  launchUrl?: string | null
  setupStatus?: 'pending' | 'ready'
  detail?: string
}

/**
 * After data-plane is healthy: commerce/email stay pending_setup until product adapters
 * finish (handoff URL when mint succeeds). Auth / businessData remain ready → enabled.
 */
export async function finalizeProductCapabilityEnsure({
  claims,
  workspaceRef,
  capabilityId,
}: {
  claims: Claims
  workspaceRef: string
  capabilityId: string
}): Promise<ProductCapabilityEnsureResult> {
  if (capabilityId === 'commerce') {
    const pending =
      pendingMessageFor('commerce') ||
      'Payments backend is ready — finish checkout setup to charge customers.'
    try {
      const redirect = await getPaymentsLaunchRedirect({ claims, ref: workspaceRef })
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
        customerMessage: COMMERCE_HANDOFF_FAIL_MESSAGE,
        launchUrl: null,
        setupStatus: 'pending',
        detail: err instanceof Error ? err.message : 'payments handoff failed',
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

  return { ok: true, state: 'ready', setupStatus: 'ready' }
}
