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

## KYC / go-live (BYOK)

If create checkout/subscription fails because the gateway isn’t ready:

1. Finish KYC on Razorpay or Stripe dashboard (create merchant account there).
2. Paste API keys once: OS `POST /api/os/payments/connect-gateway` or Studio → Payments → Connect gateway.
3. Keys sync into Indobase Payments connectors automatically.
4. Retry MCP checkout.

## Settlement rail (ask → PSP KYC → paste keys → wire)

Canonical map: repo `docs/PAYMENTS-STRIPE-RAZORPAY.md`.

When the operator wants payments on a site:

1. Ask **India (Razorpay)** vs **International (Stripe)** (or infer from geography).
2. OS/Studio: `runtime/ensure` with `settlement_market: "india"` or `"international"`.
3. Send to PSP dashboard for KYC + API keys → paste via connect-gateway.
4. For ecommerce inventory: OS **`setupShopCatalog`** (tenant DB products/stock) → **`placeTestShopOrder`** → publish `admin_html`.
5. Wire pricing + hosted checkout into **their app**: MCP `create_checkout_session` in Builder, or OS **`wireCheckout`** (`mode: "one_time"` for Buy CTAs) which returns `checkout_url`.

**Official underpinnings (do not invent APIs):**

| Rail | Merchant | Customer checkout |
|---|---|---|
| India | [API keys](https://dashboard.razorpay.com/app/keys) after dashboard KYC | [Orders](https://razorpay.com/docs/api/orders/create/) + [Checkout.js](https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/integration-steps/) |
| International | [API keys](https://dashboard.stripe.com/apikeys) after Stripe verification | [Checkout Sessions](https://docs.stripe.com/api/checkout/sessions/create) |

Prefer Indobase hosted checkout over embedding Key Secrets / raw Stripe.js.

## Anti-patterns

- Inventing MCP tools that are not listed
- Embedding Payments API keys in the Vite client
- Ensuring payments without asking (or inferring) India vs international
- Defaulting to raw Stripe Checkout Session JS or Shopify billing for Indobase apps
- Mixing Studio org Razorpay billing with merchant Indobase Payments
