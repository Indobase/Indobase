# Indobase Payments ↔ Razorpay (official docs)

Companion to [PAYMENTS-STRIPE-RAZORPAY.md](./PAYMENTS-STRIPE-RAZORPAY.md), [PAYMENTS.md](./PAYMENTS.md),
and [INDOBASE-PAYMENTS.md](./INDOBASE-PAYMENTS.md).

**Official references (use these, not guesswork):**

| Topic | Docs |
|---|---|
| Route overview | https://razorpay.com/docs/payments/route/ |
| Route integration (Linked Account → stakeholder → product config → transfers) | https://razorpay.com/docs/payments/route/integration-guide/ |
| Create Linked Account | https://razorpay.com/docs/api/payments/route/create-linked-account/ (`POST /v2/accounts`, `type=route`) |
| Orders | https://razorpay.com/docs/api/orders/create/ (`POST /v1/orders`) |
| Standard Checkout.js | https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/integration-steps/ |
| Webhook signature | https://razorpay.com/docs/webhooks/validate-test/ (`X-Razorpay-Signature`, HMAC-SHA256 raw body) |

**Status**

- Studio dual-rail KYC + agent ask (India/Razorpay vs International/Stripe) → `settlement_market`
- Live **Route Linked Account → stakeholder → product config → bank settlements** when keys + KYC fields present
- Payments engine: ConnectRazorpay + webhook settle (`payment.captured` / mandate auth) + `razorpay-client` (Orders / customers / get_customer / recurring + Route v2)
- Production still needs commercial Route keys + webhook secrets on the Payments host

Product chrome: **Indobase Payments / India settlements**. Agents ask **India (Razorpay)** so the rail is clear; keys stay machine credentials.

---

## 1. Recurring Payments, not Razorpay Subscriptions

| | Who owns the schedule | Fit |
|---|---|---|
| **Subscriptions** (Razorpay plan cadence) | Razorpay | ✗ Double scheduler |
| **Recurring Payments** (token + Indobase debit) | Indobase Payments | ✓ |

---

## 2. Core API mapping (from Razorpay docs)

| Indobase concern | Razorpay API |
|---|---|
| Linked Account (merchant) | `POST /v2/accounts` + fetch account |
| Payer / customer | `POST /v1/customers` |
| Checkout order | `POST /v1/orders` then Checkout.js with `order_id` |
| Mandate / token | Auth payment → token; `GET /v1/customers/:id/tokens` |
| Subsequent charge | `POST /v1/payments/create/recurring` |

### Pre-debit notification

Under RBI rules notify before debit (typically D−1). Confirm thresholds with Razorpay.

---

## 3. Webhook signature

Per Razorpay docs: HMAC-SHA256 over the **raw** body; header `X-Razorpay-Signature`; constant-time compare.

Platform plan billing (different product): `verifyRazorpayWebhookSignature` in
`apps/studio/lib/api/saas/razorpay-billing.ts`.

---

## 4. Studio wiring

`RazorpayRouteOnboardingProvider` in `apps/studio/lib/api/saas/merchant-kyc-provider.ts`
implements create/sync against official `/v2/accounts`. Do **not** extend
`razorpay-billing.ts` (Indobase org plan billing).

Historical engine crate lived under the removed `indobase-payments/` tree; live
merchant checkout is Studio BYOK (`merchant-psp-checkout` / `wireCheckout`).

**This is not legal advice.**
