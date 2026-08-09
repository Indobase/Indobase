import { ExternalLink, KeyRound, Loader2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { useMerchantGatewayConnectMutation } from 'data/payments/merchant-profile-mutation'
import { GATEWAY_EXTERNAL_LINKS } from 'lib/api/saas/merchant-gateway-keys'
import type { MerchantProfilePublic } from 'lib/api/saas/merchant-kyc-types'
import type { SettlementMarket } from 'lib/api/saas/merchant-kyc-provider'
import { Button, Input, cn } from 'ui'

type MerchantGatewaySetupProps = {
  projectRef: string
  merchant: MerchantProfilePublic
  readOnly?: boolean
}

/**
 * Primary merchant payments path: KYC on Razorpay/Stripe sites, then paste API keys here.
 * Agents wire checkout once keys validate.
 */
export function MerchantGatewaySetup({
  projectRef,
  merchant,
  readOnly = false,
}: MerchantGatewaySetupProps) {
  const connected = merchant.gateway_keys_configured === true
  const [market, setMarket] = useState<SettlementMarket>(
    merchant.settlement_market === 'india' ? 'india' : 'international'
  )
  const [keyId, setKeyId] = useState('')
  const [keySecret, setKeySecret] = useState('')
  const [publishableKey, setPublishableKey] = useState('')
  const [secretKey, setSecretKey] = useState('')
  const [webhookSecret, setWebhookSecret] = useState('')

  const { mutateAsync: connectGateway, isPending } = useMerchantGatewayConnectMutation()
  const links = GATEWAY_EXTERNAL_LINKS[market]

  const onConnect = async () => {
    try {
      await connectGateway({
        projectRef,
        settlement_market: market,
        ...(market === 'india'
          ? { key_id: keyId, key_secret: keySecret, webhook_secret: webhookSecret || null }
          : {
              publishable_key: publishableKey || null,
              secret_key: secretKey,
              webhook_secret: webhookSecret || null,
            }),
      })
      toast.success(
        market === 'india'
          ? 'Razorpay keys connected — agents can wire checkout'
          : 'Stripe keys connected — agents can wire checkout'
      )
      setKeyId('')
      setKeySecret('')
      setPublishableKey('')
      setSecretKey('')
      setWebhookSecret('')
    } catch {
      // toast from mutation default onError
    }
  }

  return (
    <section className="space-y-4 rounded-md border border-border p-4">
      <div className="flex items-start gap-3">
        <KeyRound size={18} className="mt-0.5 shrink-0 text-foreground-light" />
        <div className="space-y-1">
          <h2 className="text-sm font-medium text-foreground">Connect payment gateway</h2>
          <p className="text-xs text-foreground-lighter">
            Create your merchant account and finish KYC on Razorpay or Stripe. Paste API keys here —
            Indobase agents use them to set up checkout on your site.
          </p>
        </div>
      </div>

      {connected ? (
        <div className="rounded-md border border-brand bg-brand/10 px-3 py-2 text-sm text-foreground-light">
          Gateway keys connected
          {merchant.gateway_key_hint ? (
            <span className="font-mono text-xs text-foreground"> ({merchant.gateway_key_hint})</span>
          ) : null}
          . Keys stay in Studio — ask an agent to wireCheckout so Buy/Subscribe CTAs get a real checkout URL.
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {(
          [
            { id: 'india' as const, label: 'India (Razorpay)' },
            { id: 'international' as const, label: 'International (Stripe)' },
          ] as const
        ).map((opt) => (
          <button
            key={opt.id}
            type="button"
            disabled={readOnly || connected}
            onClick={() => setMarket(opt.id)}
            className={cn(
              'rounded-md border px-3 py-1.5 text-xs transition-colors',
              market === opt.id
                ? 'border-brand bg-brand/10 text-foreground'
                : 'border-border text-foreground-light hover:bg-surface-200'
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <ol className="list-decimal space-y-2 pl-5 text-xs text-foreground-light">
        <li>
          Sign up / finish KYC on the {market === 'india' ? 'Razorpay' : 'Stripe'} dashboard
          <span className="mt-1 flex flex-wrap gap-2">
            <Button asChild type="default" size="tiny" icon={<ExternalLink size={12} />}>
              <a href={links.signup} target="_blank" rel="noopener noreferrer">
                Create account
              </a>
            </Button>
            <Button asChild type="default" size="tiny" icon={<ExternalLink size={12} />}>
              <a href={links.kyc} target="_blank" rel="noopener noreferrer">
                Account / KYC
              </a>
            </Button>
            <Button asChild type="default" size="tiny" icon={<ExternalLink size={12} />}>
              <a href={links.keys} target="_blank" rel="noopener noreferrer">
                API keys
              </a>
            </Button>
          </span>
        </li>
        <li>Copy API keys from their dashboard (not shared with Indobase until you paste them).</li>
        <li>Paste keys below — we validate them, then agents wire gateway checkout into your site.</li>
      </ol>

      {!readOnly && !connected ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {market === 'india' ? (
            <>
              <Input
                label="Key Id"
                placeholder="rzp_live_… or rzp_test_…"
                value={keyId}
                onChange={(e) => setKeyId(e.target.value)}
                autoComplete="off"
              />
              <Input
                label="Key Secret"
                type="password"
                placeholder="Key Secret"
                value={keySecret}
                onChange={(e) => setKeySecret(e.target.value)}
                autoComplete="off"
              />
            </>
          ) : (
            <>
              <Input
                label="Publishable key"
                placeholder="pk_live_… or pk_test_…"
                value={publishableKey}
                onChange={(e) => setPublishableKey(e.target.value)}
                autoComplete="off"
              />
              <Input
                label="Secret key"
                type="password"
                placeholder="sk_live_… or sk_test_…"
                value={secretKey}
                onChange={(e) => setSecretKey(e.target.value)}
                autoComplete="off"
              />
            </>
          )}
          <Input
            className="sm:col-span-2"
            label="Webhook secret (optional)"
            type="password"
            placeholder="whsec_… or Razorpay webhook secret"
            value={webhookSecret}
            onChange={(e) => setWebhookSecret(e.target.value)}
            autoComplete="off"
          />
          <div className="sm:col-span-2">
            <Button
              type="primary"
              loading={isPending}
              disabled={
                isPending ||
                (market === 'india'
                  ? !keyId.trim() || !keySecret.trim()
                  : !secretKey.trim() || !publishableKey.trim())
              }
              icon={isPending ? <Loader2 className="animate-spin" size={14} /> : undefined}
              onClick={() => void onConnect()}
            >
              Save & validate keys
            </Button>
          </div>
        </div>
      ) : null}

      {readOnly && !connected ? (
        <p className="text-xs text-foreground-lighter">
          Ask an organization owner or admin to paste gateway API keys.
        </p>
      ) : null}
    </section>
  )
}
