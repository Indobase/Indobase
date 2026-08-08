/**
 * Stripe Connect Account Links for international merchant onboarding.
 * Official: https://docs.stripe.com/connect/hosted-onboarding
 *           https://docs.stripe.com/api/account_links/create
 *
 * Uses platform secret when configured. Never expose the secret to the browser.
 */

export type StripeConnectOnboardingResult = {
  accountId: string
  onboardingUrl: string | null
  stubbed: boolean
  message: string
  meta: Record<string, unknown>
}

function stripeSecretKey(): string {
  return (
    process.env.INDOBASE_PAYMENTS_STRIPE_SECRET_KEY?.trim() ||
    process.env.STRIPE_SECRET_KEY?.trim() ||
    process.env.STRIPE_PLATFORM_SECRET_KEY?.trim() ||
    ''
  )
}

export function stripeConnectConfigured(): boolean {
  return stripeSecretKey().length > 0
}

function studioOrigin(): string {
  return (
    process.env.STUDIO_URL?.trim() ||
    process.env.NEXT_PUBLIC_STUDIO_URL?.trim() ||
    'https://studio.indobase.in'
  ).replace(/\/+$/, '')
}

/**
 * Create (or reuse) a Connect account and mint an Account Link for hosted onboarding.
 */
export async function createStripeConnectOnboardingLink(input: {
  projectRef: string
  email: string | null
  country?: string | null
  existingAccountId?: string | null
}): Promise<StripeConnectOnboardingResult> {
  const secret = stripeSecretKey()
  const country = (input.country || 'US').trim().toUpperCase().slice(0, 2) || 'US'
  const returnBase = `${studioOrigin()}/project/${encodeURIComponent(input.projectRef)}/payments`

  if (!secret) {
    const accountId =
      input.existingAccountId ||
      `stripe_merchant_${input.projectRef.replace(/[^a-zA-Z0-9]/g, '').slice(0, 24)}`
    return {
      accountId,
      onboardingUrl: null,
      stubbed: true,
      message:
        'International cards selected — set INDOBASE_PAYMENTS_STRIPE_SECRET_KEY to mint Stripe Connect Account Links (docs.stripe.com/connect/hosted-onboarding).',
      meta: {
        docs: 'https://docs.stripe.com/connect/hosted-onboarding',
        settlement_adapter: 'stripe',
      },
    }
  }

  try {
    let accountId = input.existingAccountId?.startsWith('acct_')
      ? input.existingAccountId
      : null

    if (!accountId) {
      const createBody = new URLSearchParams()
      createBody.set('type', 'express')
      createBody.set('country', country)
      if (input.email) createBody.set('email', input.email)
      createBody.set('capabilities[card_payments][requested]', 'true')
      createBody.set('capabilities[transfers][requested]', 'true')
      createBody.set('metadata[indobase_project_ref]', input.projectRef)

      const createRes = await fetch('https://api.stripe.com/v1/accounts', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${secret}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'IndobaseStudio/StripeConnect',
        },
        body: createBody.toString(),
      })
      const createJson = (await createRes.json()) as {
        id?: string
        error?: { message?: string }
      }
      if (!createRes.ok || !createJson.id) {
        throw new Error(createJson.error?.message || `Stripe accounts create HTTP ${createRes.status}`)
      }
      accountId = createJson.id
    }

    const linkBody = new URLSearchParams()
    linkBody.set('account', accountId)
    linkBody.set('refresh_url', `${returnBase}?stripe_refresh=1`)
    linkBody.set('return_url', `${returnBase}?stripe_return=1`)
    linkBody.set('type', 'account_onboarding')

    const linkRes = await fetch('https://api.stripe.com/v1/account_links', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secret}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'IndobaseStudio/StripeConnect',
      },
      body: linkBody.toString(),
    })
    const linkJson = (await linkRes.json()) as {
      url?: string
      error?: { message?: string }
    }
    if (!linkRes.ok || !linkJson.url) {
      throw new Error(linkJson.error?.message || `Stripe account_links HTTP ${linkRes.status}`)
    }

    return {
      accountId,
      onboardingUrl: linkJson.url,
      stubbed: false,
      message:
        'Stripe Connect Account Link ready — complete hosted onboarding, then Confirm go-live in Studio (docs.stripe.com/connect/hosted-onboarding).',
      meta: {
        docs: 'https://docs.stripe.com/connect/hosted-onboarding',
        docs_api: 'https://docs.stripe.com/api/account_links/create',
        onboarding_url: linkJson.url,
        settlement_adapter: 'stripe',
        settlement_market: 'international',
      },
    }
  } catch (err) {
    const accountId =
      input.existingAccountId ||
      `stripe_merchant_${input.projectRef.replace(/[^a-zA-Z0-9]/g, '').slice(0, 24)}`
    return {
      accountId,
      onboardingUrl: null,
      stubbed: true,
      message: `Stripe Connect onboarding failed: ${err instanceof Error ? err.message : 'unknown'}. See https://docs.stripe.com/connect/hosted-onboarding`,
      meta: {
        docs: 'https://docs.stripe.com/connect/hosted-onboarding',
        settlement_adapter: 'stripe',
        error: err instanceof Error ? err.message : 'unknown',
      },
    }
  }
}
