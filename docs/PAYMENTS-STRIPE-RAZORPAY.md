# Indobase Payments ↔ Stripe & Razorpay (official docs)

Source of truth for mapping **Indobase Payments** rails to public PSP documentation.
Product chrome stays Indobase (India settlements / International cards). Agents may ask
**India (Razorpay)** vs **International (Stripe)** so the operator picks the rail; we then
Enable via Studio and wire checkout into the site they built.

This is not legal advice. Confirm commercial / KYC requirements with each PSP.

---

## Operator flow (OS / Builder) — BYOK

Merchants create accounts and finish KYC **on Razorpay or Stripe**. They paste API keys into
Indobase Studio (**Payments → Connect gateway**). Agents wire checkout against those keys.

1. Ask: **India (Razorpay)** or **International (Stripe)** (or free-text market).
2. `POST /api/os/runtime/ensure` with `settlement_market: "india" | "international"`.
3. Send operator to the PSP dashboard for signup / KYC / API keys.
4. Paste keys **once**:
   - OS agent tool: **connectGateway** (`POST /api/os/tools/connectGateway`, alias
     `connectPaymentGateway`) with `settlement_market` + keys — preferred in chat
   - Same handler: `POST /api/os/payments/connect-gateway`
   - Studio UI fallback: **Payments → Connect gateway** (`action: "connect_gateway"`)
   Keys are validated against the PSP, stored encrypted in Studio, and synced into
   Indobase Payments connectors (`POST /api/v1/connectors/razorpay` or `/stripe`).
5. Wire pricing + checkout into the **built site** (hosted checkout / MCP).

Platform Route Linked Accounts / Stripe Connect Account Links are **opt-in** via
`INDOBASE_MERCHANT_PLATFORM_ONBOARDING=true` — not the default path.

| Operator choice | `settlement_market` | `settlement_adapter` | Official product |
|---|---|---|---|
| India (Razorpay) | `india` | `razorpay_route` | Merchant [API keys](https://dashboard.razorpay.com/app/keys) + [Orders](https://razorpay.com/docs/api/orders/) + [Standard Checkout](https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/integration-steps/) |
| International (Stripe) | `international` | `stripe` | Merchant [API keys](https://dashboard.stripe.com/apikeys) + [Checkout Sessions](https://docs.stripe.com/api/checkout/sessions/create) |

---

## India — Razorpay (official)

### Merchant settlement (Route Linked Accounts)

Follow Razorpay’s Route guide, not “Subscriptions”:

1. [Integrate with Route](https://razorpay.com/docs/payments/route/integration-guide/)
2. [Create Linked Account](https://razorpay.com/docs/api/payments/route/create-linked-account/) — `POST /v2/accounts` with `"type": "route"`
3. Create stakeholder → request product configuration → update bank details (see same integration guide)
4. [Linked Accounts overview](https://razorpay.com/docs/payments/route/linked-account/)

**Required create fields (docs):** `email`, `phone`, `legal_business_name`, `business_type`, `profile` (+ `legal_info.pan` / `gst` when available).  
**Auth:** HTTP Basic `[KEY_ID]:[KEY_SECRET]` ([API keys](https://razorpay.com/docs/payments/dashboard/account-settings/api-keys/)).

Indobase Studio maps KYC → this payload in `merchant-kyc-provider.ts` when
`RAZORPAY_ROUTE_KEY_ID` + `RAZORPAY_ROUTE_KEY_SECRET` (or `INDOBASE_PAYMENTS_RAZORPAY_*`) are set.

On submit, Studio runs the Route guide sequence:

1. [Create Linked Account](https://razorpay.com/docs/api/payments/route/create-linked-account/)
2. [Create Stakeholder](https://razorpay.com/docs/api/payments/route/create-stakeholder/)
3. [Request product config](https://razorpay.com/docs/api/payments/route/request-product-config/) (`product_name: route`)
4. [Update product / settlements](https://razorpay.com/docs/api/payments/route/update-product-config/) (account_number, ifsc_code, beneficiary_name, `tnc_accepted`)

India charge webhooks (`payment.captured` / `payment.failed`) settle invoices in the Payments engine
(`adapters/razorpay.rs`) using notes `indobase.transaction_id`. Mandate auth tokens upsert payment methods.

### Customer checkout (built site)

Per [Standard Checkout integration steps](https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/integration-steps/):

1. Server: [Create Order](https://razorpay.com/docs/api/orders/create/) — `POST /v1/orders` (`amount` in paise, `currency: "INR"`)
2. Client: load `https://checkout.razorpay.com/v1/checkout.js`, open Checkout with `order_id` + Key ID
3. Server: [verify payment signature](https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/integration-steps/#13-store-fields-in-your-server) (`razorpay_order_id` + `razorpay_payment_id` + `razorpay_signature`)
4. Prefer webhooks for capture confirmation — [validate webhooks](https://razorpay.com/docs/webhooks/validate-test/) (`X-Razorpay-Signature`, HMAC-SHA256 of **raw** body)

Indobase default for Builder/OS sites: **Indobase Payments hosted checkout** via the OS **`wireCheckout`** tool (`POST /api/os/tools/wireCheckout` → plan + customer + session → `checkout_url`). MCP `create_checkout_session` remains available for Builder; agents should prefer `wireCheckout`. Do not put Key Secret in the browser.

### Recurring (engine)

Prefer Razorpay **Recurring Payments** (token + subsequent charge) over Razorpay Subscriptions plans — Indobase owns the billing schedule. See [RAZORPAY-CONNECTOR.md](./RAZORPAY-CONNECTOR.md).

| Concern | Official API |
|---|---|
| Customer | `POST /v1/customers` |
| Order (auth / charge) | `POST /v1/orders` |
| Recurring charge | `POST /v1/payments/create/recurring` |
| Tokens | `GET /v1/customers/:id/tokens` |

---

## International — Stripe (official)

### Customer checkout (built site)

Prefer [Checkout Sessions](https://docs.stripe.com/api/checkout/sessions/create) (hosted):

1. Server creates Session (`mode=payment` or `subscription`, `line_items`, `success_url`, `cancel_url`)
2. Redirect customer to `session.url`
3. Confirm via [webhooks](https://docs.stripe.com/webhooks) (`checkout.session.completed`, etc.) — verify signatures with the endpoint secret

Quickstart: [Stripe Checkout quickstart](https://docs.stripe.com/checkout/quickstart).

Indobase Payments Stripe connector + hosted checkout wrap this; Builder should not embed raw publishable keys as the default path.

### Merchant onboarding (platform)

When Indobase acts as platform for merchant payouts/cards:

1. Create connected account — [Accounts API](https://docs.stripe.com/api/accounts/create) (controller / Express per platform design)
2. [Account Links](https://docs.stripe.com/api/account_links/create) `type=account_onboarding` with `return_url` + `refresh_url`
3. Redirect merchant; then check `charges_enabled` / `details_submitted` ([hosted onboarding](https://docs.stripe.com/connect/hosted-onboarding))
4. Listen to Connect webhooks (`account.updated`)

New platforms should also review Stripe’s current [Accounts v2 / interactive platform guide](https://docs.stripe.com/connect/interactive-platform-guide) — Express Account types are legacy for greenfield Connect.

Studio mints Connect **Account Links** when `INDOBASE_PAYMENTS_STRIPE_SECRET_KEY` (or `STRIPE_SECRET_KEY`) is set — see `stripe-connect-onboarding.ts`. Operator completes hosted onboarding (`return_url` / `refresh_url` back to project Payments), then Confirm go-live.

---

## Env (machine credentials — not chat “Connect”)

| Rail | Env |
|---|---|
| India Route | `RAZORPAY_ROUTE_KEY_ID`, `RAZORPAY_ROUTE_KEY_SECRET` (or `INDOBASE_PAYMENTS_RAZORPAY_KEY_*`) |
| India webhooks | webhook secret used by Payments engine (HMAC raw body) |
| International | Stripe secret / publishable / webhook secrets on Payments connector |

Never ask the operator to paste keys into CFOS chat. Keys live in Studio / Payments admin.

---

## Related Indobase docs

- [PAYMENTS.md](./PAYMENTS.md) — product overview
- [RAZORPAY-CONNECTOR.md](./RAZORPAY-CONNECTOR.md) — engine Recurring mapping
- [INDOBASE-PAYMENTS.md](./INDOBASE-PAYMENTS.md) — deploy / ops
