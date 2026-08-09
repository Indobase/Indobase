# Indobase Payments ↔ Razorpay (historical notes)

Companion to [PAYMENTS-STRIPE-RAZORPAY.md](./PAYMENTS-STRIPE-RAZORPAY.md), [PAYMENTS.md](./PAYMENTS.md),
and [INDOBASE-PAYMENTS.md](./INDOBASE-PAYMENTS.md).

**Status:** Merchant checkout is **Studio BYOK** (paste Razorpay keys → Payment Links /
Subscriptions via `wireCheckout`). Route Linked Accounts and the legacy engine stack are
**not** product paths. This doc keeps historical API notes for reference only.

**Official references:**

| Topic | Docs |
|---|---|
| Orders | https://razorpay.com/docs/api/orders/create/ (`POST /v1/orders`) |
| Payment Links | https://razorpay.com/docs/api/payments/payment-links/ |
| Subscriptions | https://razorpay.com/docs/api/payments/subscriptions/ |
| Standard Checkout.js | https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/integration-steps/ |
| Webhook signature | https://razorpay.com/docs/webhooks/validate-test/ (`X-Razorpay-Signature`, HMAC-SHA256 raw body) |

Product chrome: **Indobase Payments / India settlements**. Agents ask **India (Razorpay)**;
keys stay in Studio SaaS.

---

## 1. Recurring under BYOK

Prefer Razorpay **Subscriptions** / Payment Links owned by the merchant account.
Do not invent a second scheduler in Studio.

---

## 2. Webhook signature

Per Razorpay docs: HMAC-SHA256 over the **raw** body; header `X-Razorpay-Signature`; constant-time compare.

Platform plan billing (different product): `verifyRazorpayWebhookSignature` in
`apps/studio/lib/api/saas/razorpay-billing.ts`.

---

## 3. Studio wiring

Merchant path: `merchant-psp-checkout` / `payments-wire-checkout` / OS `connectGateway` +
`wireCheckout`. Do **not** extend `razorpay-billing.ts` (Indobase org plan billing).

Historical engine crate lived under the removed `indobase-payments/` tree.

**This is not legal advice.**
