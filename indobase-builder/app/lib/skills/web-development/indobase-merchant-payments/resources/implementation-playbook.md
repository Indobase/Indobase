# Indobase Payments — implementation playbook

## Happy path (Builder / OS)

1. User: “Add pricing and checkout.”
2. Ask **India (Razorpay)** vs **International (Stripe)** (or infer from geography).
3. `runtime/ensure` with `settlement_market: "india"` or `"international"`.
4. Operator finishes KYC on the PSP dashboard and pastes API keys → **connectGateway** (or MCP `connect_gateway`).
5. **wireCheckout** / MCP `create_checkout_session` with `plan_name`, `price`, `customer_email` (`mode: "one_time"` for Buy CTAs).
6. Wire Subscribe/Buy to the returned `checkout_url` only — never invent a URL.

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

## create_checkout_session / wireCheckout body

Required:

- `customer_email`
- `plan_name` + `price` (major units, e.g. `"999"`) — or `plan_version_id` (Stripe price id / Razorpay plan id)

Optional: `mode` (`subscription` | `one_time`), `currency`, `billing_period`, `expires_in_hours`.

Response includes `checkout_url` — use that for the button href.

Checkout is created with the merchant’s own Razorpay Payment Link or Stripe Checkout Session (keys stored in Studio SaaS).

## KYC / go-live (BYOK)

1. Finish KYC on Razorpay or Stripe dashboard (create merchant account there).
2. Paste API keys once: OS `connectGateway` or Studio → Payments → Connect gateway.
3. Keys stay encrypted in Studio — checkout calls the PSP directly (no separate billing engine).
4. Retry wireCheckout / create_checkout_session.

## Settlement rail (ask → PSP KYC → paste keys → wire)

Canonical map: repo `docs/PAYMENTS-STRIPE-RAZORPAY.md`.

When the operator wants payments on a site:

1. Ask **India (Razorpay)** vs **International (Stripe)** (or infer from geography).
2. OS/Studio: `runtime/ensure` with `settlement_market: "india"` or `"international"`.
3. Send to PSP dashboard for KYC + API keys → paste via connectGateway.
4. For ecommerce inventory: OS **`setupShopCatalog`** → **`placeTestShopOrder`** → publish `admin_html`.
5. Wire CTAs with **`wireCheckout`** (`mode: "one_time"` for Buy).

**Official underpinnings (do not invent APIs):**

| Rail | Merchant | Customer checkout |
|---|---|---|
| India | [API keys](https://dashboard.razorpay.com/app/keys) after dashboard KYC | [Payment Links](https://razorpay.com/docs/api/payments/payment-links/) / [Subscriptions](https://razorpay.com/docs/api/payments/subscriptions/) |
| International | [API keys](https://dashboard.stripe.com/apikeys) after Stripe verification | [Checkout Sessions](https://docs.stripe.com/api/checkout/sessions/create) |

Prefer hosted checkout URLs over embedding Key Secrets / raw Stripe.js in the client.

## Anti-patterns

- Inventing MCP tools that are not listed
- Embedding payment API keys in the Vite client
- Ensuring payments without asking (or inferring) India vs international
- Inventing checkout URLs instead of using wireCheckout / create_checkout_session
- Mixing Studio org platform billing with merchant BYOK checkout
