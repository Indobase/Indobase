# Indobase Payments ↔ Razorpay (next step)

Companion to [PAYMENTS.md](./PAYMENTS.md) and [INDOBASE-PAYMENTS.md](./INDOBASE-PAYMENTS.md).

**Status: not implemented in phase 1.** The Indobase Payments engine (Meteroid
fork) ships with the **Stripe** (or mock) adapter working. Razorpay is the India
money-movement path once partnerships and product work land.

Product-facing name remains **Indobase Payments**. Operators target Studio
sign-in (SSO handoff follow-up). Razorpay keys below are **machine credentials**,
not a second user account.

---

## 1. Recurring Payments, not Razorpay Subscriptions

| | Who owns the schedule | Fit for Indobase Payments |
|---|---|---|
| **Subscriptions** — Razorpay charges on its plan cadence | Razorpay | ✗ Two schedulers; double-charge risk |
| **Recurring Payments** — customer authorises once; Indobase charges the token when ready | Indobase Payments engine | ✓ |

Indobase Payments owns plans, usage, proration, and invoice timing. Razorpay
stores the mandate and executes debits.

---

## 2. Core API mapping (when building)

| Indobase Payments concern | Razorpay |
|---|---|
| Create payer / customer | `POST /v1/customers` |
| Collect mandate (card / UPI AutoPay / e-mandate) | Authorisation payment → **token** |
| Read saved method | `GET /v1/customers/:id/tokens/:token_id` |
| Charge | `POST /v1/orders` + recurring charge against token |

### Pre-debit notification

Under RBI rules the customer must be notified before each debit. The payments
engine must schedule:

1. Notify (typically D−1)
2. Debit on D

Amount freezes at notification time when required. Confirm thresholds with
Razorpay when building.

---

## 3. Webhook signature

Razorpay signs webhooks with **HMAC-SHA256 over the raw request body**, secret in
`X-Razorpay-Signature`.

Verify against the **raw body**, never a re-serialised JSON object. Use
constant-time comparison.

Reference (platform billing only — different product):
`verifyRazorpayWebhookSignature` in `apps/studio/lib/api/saas/razorpay-billing.ts`.

---

## 4. Still blocking before money-movement implementation

1. Commercial relationship (Route / Linked Accounts vs partner) — sets whose
   `key_id` authenticates each call, liability, and settlement.
2. Connector in the Indobase Payments fork (replace/augment Stripe adapter).
3. ~~Studio SSO~~ **done**. ~~Merchant KYC UI + `saas.project_payment_merchants`~~
   **done** (stub provider until Route HTTP is wired).

Studio KYC already exposes `MerchantOnboardingProvider` /
`StubRazorpayRouteProvider` in `apps/studio/lib/api/saas/merchant-kyc-provider.ts`.
Wire live Linked Account create/sync there when keys and partnership land —
do not extend `razorpay-billing.ts` (Indobase plan billing).

Settle partnerships before writing the HTTP client — it changes auth on every
call above.

**This is not legal advice.**
