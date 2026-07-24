# Indobase Payments — implementation playbook

## Happy path (Builder)

1. User: “Add pricing and checkout.”
2. Build mode generates `/pricing` (or section) + Subscribe buttons.
3. Follow-up: MCP `list_product_families` → `create_plan` (or `list_plans` if plans exist).
4. MCP `create_customer` (test email) → `create_checkout_session` with `customer_id` + `plan_version_id`.
5. Wire Subscribe to open `checkout_url` from the session (or your edge proxy that creates the session).
6. For “Manage billing”: MCP `create_portal_token` → navigate to portal URL with token.

## Minimal checkout button (redirect)

```tsx
// After your backend/edge returns { checkout_url }
export function SubscribeButton({ checkoutUrl }: { checkoutUrl: string }) {
  return (
    <a href={checkoutUrl} className="rounded bg-black px-4 py-2 text-white">
      Subscribe
    </a>
  );
}
```

## create_checkout_session body (MCP)

Required fields:

- `customer_id` — Payments customer id or alias
- `plan_version_id` — from `get_plan` / create plan response

Optional: `expires_in_hours` (default 1), `trial_duration_days`, `coupon_code`, `charge_automatically`.

Response includes `session.checkout_url` — use that for the button href.

## create_portal_token

Args: `id_or_alias` (customer id or alias).

Response: `{ token, portal_url }`. Open:

`${portal_url}/portal/customer?token=${encodeURIComponent(token)}`

## KYC / go-live

If create checkout/subscription fails with merchant KYC not verified:

1. Studio → project → Payments
2. Complete merchant onboarding → submit
3. Confirm Stripe go-live (org owner/admin)
4. In Payments dashboard: Connect Stripe keys + webhook
5. Retry MCP checkout

## Anti-patterns

- Inventing MCP tools that are not listed
- Embedding Payments API keys in the Vite client
- Defaulting to Stripe Checkout Session JS or Shopify billing for Indobase apps
- Mixing Studio org Razorpay billing with merchant Indobase Payments
