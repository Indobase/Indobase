# Indobase Payments ↔ Razorpay

Companion to [PAYMENTS.md](./PAYMENTS.md). Product-facing name is always **Indobase Payments**. This
note covers how Indobase talks to Razorpay once the commercial relationship is settled.

---

## 1. Recurring Payments, not Razorpay Subscriptions

| | Who owns the schedule | Fit for Indobase Payments |
|---|---|---|
| **Subscriptions** — Razorpay charges on its plan cadence | Razorpay | ✗ Two schedulers; double-charge risk |
| **Recurring Payments** — customer authorises once; Indobase charges the token when ready | Indobase | ✓ |

Indobase owns plans, usage, proration, and invoice timing. Razorpay stores the mandate and executes
debits.

---

## 2. Core API mapping

| Indobase concern | Razorpay |
|---|---|
| Create payer / customer | `POST /v1/customers` |
| Collect mandate (card / UPI AutoPay / e-mandate) | Authorisation payment → **token** |
| Read saved method | `GET /v1/customers/:id/tokens/:token_id` |
| Charge | `POST /v1/orders` + recurring charge against token |

### Pre-debit notification

Under RBI rules the customer must be notified before each debit. Indobase must schedule:

1. Notify (typically D−1)
2. Debit on D

Amount freezes at notification time when required. Failures above the AFA limit are a distinct
recoverable state, not a generic payment error. Confirm thresholds with Razorpay when building.

---

## 3. Webhook signature

Razorpay signs webhooks with **HMAC-SHA256 over the raw request body**, secret in
`X-Razorpay-Signature`.

Verify against the **raw body**, never a re-serialised JSON object (key order / whitespace break the
digest). Use constant-time comparison.

Reference implementation for header + digest (platform billing only — different product):
`verifyRazorpayWebhookSignature` in `apps/studio/lib/api/saas/razorpay-billing.ts`.

---

## 4. Still blocking

Naming Razorpay as the provider does not choose the **commercial relationship** (Route / Linked
Accounts sub-merchant vs partner). That choice sets:

- whose `key_id` authenticates each call,
- chargeback liability,
- direct vs split settlement,
- what Indobase stores per tenant.

Settle that with Razorpay partnerships before writing the HTTP client — it changes auth on every
call above.
