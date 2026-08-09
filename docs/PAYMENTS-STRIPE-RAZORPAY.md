# Indobase Payments ↔ Stripe & Razorpay (official docs)

Source of truth for mapping **Indobase Payments** rails to public PSP documentation.
Product chrome stays Indobase (India settlements / International cards). Agents may ask
**India (Razorpay)** vs **International (Stripe)** so the operator picks the rail; we then
Enable via Studio and wire checkout into the site they built.

This is not legal advice. Confirm commercial / KYC requirements with each PSP.

---

## Operator flow (OS / Builder) — BYOK only

Merchants create accounts and finish KYC **on Razorpay or Stripe**. They paste API keys into
Indobase Studio (**Payments → Connect gateway**). Agents wire checkout against those keys.
Studio does **not** create Razorpay Route Linked Accounts or Stripe Connect Account Links.

1. Ask: **India (Razorpay)** or **International (Stripe)** (or free-text market).
2. `POST /api/os/runtime/ensure` with `settlement_market: "india" | "international"`.
3. Send operator to the PSP dashboard for signup / KYC / API keys.
4. Paste keys **once**:
   - OS agent tool: **connectGateway** (`POST /api/os/tools/connectGateway`, alias
     `connectPaymentGateway`) with `settlement_market` + keys — preferred in chat
   - Same handler: `POST /api/os/payments/connect-gateway`
   - Studio UI fallback: **Payments → Connect gateway** (`action: "connect_gateway"`)
   Keys are validated against the PSP and stored encrypted in Studio SaaS only.
   Checkout uses Razorpay Payment Links / Subscriptions or Stripe Checkout Sessions
   directly (`wireCheckout` / MCP `create_checkout_session`) — no separate billing engine.
5. Wire pricing + checkout into the **built site** with the returned `checkout_url`.

| Operator choice | `settlement_market` | `settlement_adapter` | Official product |
|---|---|---|---|
| India (Razorpay) | `india` | `razorpay_route` | Merchant [API keys](https://dashboard.razorpay.com/app/keys) + [Payment Links](https://razorpay.com/docs/api/payments/payment-links/) / [Subscriptions](https://razorpay.com/docs/api/payments/subscriptions/) |
| International (Stripe) | `international` | `stripe` | Merchant [API keys](https://dashboard.stripe.com/apikeys) + [Checkout Sessions](https://docs.stripe.com/api/checkout/sessions/create) |

> Internal note: `settlement_adapter` value `razorpay_route` is a legacy DB/agent id for the
> India rail. It does **not** mean Studio creates Route Linked Accounts.

---

## India — Razorpay (official)

### Merchant setup (BYOK)

1. Operator signs up / finishes KYC on the [Razorpay Dashboard](https://dashboard.razorpay.com/)
2. Creates [API keys](https://dashboard.razorpay.com/app/keys)
3. Pastes Key Id + Key Secret in Studio Payments → Connect gateway (or OS `connectGateway`)

### Customer checkout (built site)

Per [Standard Checkout integration steps](https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/integration-steps/):

1. Server: [Create Order](https://razorpay.com/docs/api/orders/create/) — `POST /v1/orders` (`amount` in paise, `currency: "INR"`)
2. Client: load `https://checkout.razorpay.com/v1/checkout.js`, open Checkout with `order_id` + Key ID
3. Server: [verify payment signature](https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/integration-steps/#13-store-fields-in-your-server) (`razorpay_order_id` + `razorpay_payment_id` + `razorpay_signature`)
4. Prefer webhooks for capture confirmation — [validate webhooks](https://razorpay.com/docs/webhooks/validate-test/) (`X-Razorpay-Signature`, HMAC-SHA256 of **raw** body)

Indobase default for Builder/OS sites: **merchant-hosted checkout** via the OS **`wireCheckout`** tool (`POST /api/os/tools/wireCheckout` → Razorpay Payment Link or Stripe Checkout Session → `checkout_url`). MCP `create_checkout_session` remains available for Builder; agents should prefer `wireCheckout`. Do not put Key Secret in the browser.

### Recurring (BYOK)

Prefer Razorpay **Subscriptions** / Payment Links for merchant recurring under BYOK.
Historical engine notes (parked): [RAZORPAY-CONNECTOR.md](./RAZORPAY-CONNECTOR.md).

---

## International — Stripe (official)

### Customer checkout (built site)

Prefer [Checkout Sessions](https://docs.stripe.com/api/checkout/sessions/create) (hosted):

1. Server creates Session (`mode=payment` or `subscription`, `line_items`, `success_url`, `cancel_url`)
2. Redirect customer to `session.url`
3. Confirm via [webhooks](https://docs.stripe.com/webhooks) (`checkout.session.completed`, etc.) — verify signatures with the endpoint secret

Quickstart: [Stripe Checkout quickstart](https://docs.stripe.com/checkout/quickstart).

Builder should not embed raw publishable keys as the default path — use `wireCheckout` / MCP.

### Merchant setup (BYOK)

1. Operator completes verification on the [Stripe Dashboard](https://dashboard.stripe.com/)
2. Creates [API keys](https://dashboard.stripe.com/apikeys)
3. Pastes secret (+ optional publishable / webhook secret) in Studio Payments → Connect gateway

---

## Env

Merchant PSP credentials live in Studio SaaS (encrypted BYOK), not platform Route/Connect env.

| Concern | Where |
|---|---|
| Merchant Razorpay / Stripe keys | Studio Connect gateway / `connectGateway` |
| Org SaaS plan billing (Indobase → customer) | `razorpay-billing.ts` (separate product) |

Never ask the operator to paste merchant keys into CFOS chat. Keys live in Studio.

---

## Related Indobase docs

- [PAYMENTS.md](./PAYMENTS.md) — product overview
- [RAZORPAY-CONNECTOR.md](./RAZORPAY-CONNECTOR.md) — historical connector notes (parked)
- [INDOBASE-PAYMENTS.md](./INDOBASE-PAYMENTS.md) — BYOK status + completed VPS teardown notes
