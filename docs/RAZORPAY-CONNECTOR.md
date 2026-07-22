# Razorpay connector for the Meteroid fork

Companion to [PAYMENTS.md](./PAYMENTS.md). That document covers *whether* and *under what licence*;
this one covers *what to actually build*. Everything here lives in the **published AGPL fork**, not
in this repository — see PAYMENTS.md §3 for the boundary.

Verified against Meteroid at `29855ed` (2026-07-21).

---

## 1. Use Razorpay Recurring Payments, not Razorpay Subscriptions

Razorpay offers two recurring models, and they are not interchangeable:

| | Who owns the schedule | Fit |
|---|---|---|
| **Subscriptions** — Plans + Subscriptions; Razorpay charges automatically at set intervals | **Razorpay** | ✗ Collides with Meteroid |
| **Recurring Payments** — customer authorises once, you charge against a token when you choose | **You** | ✓ Correct |

Meteroid's entire purpose is deciding what to charge and when — usage metering, tiering, mid-cycle
changes, proration. Razorpay Subscriptions wants to own that same decision. Adopting it would mean
two systems each believing they own the subscription, and reconciling them is a permanent source of
double-charges and drift.

**Use Recurring Payments (token-based).** Meteroid computes the amount and the moment; Razorpay
executes a debit against a registered mandate. Each system keeps one job.

---

## 2. The trait maps cleanly — with one exception

The contract is `PaymentProvider` in
`modules/meteroid/crates/meteroid-store/src/adapters/payment_service_providers.rs:47`. Four methods:

| Trait method | Razorpay equivalent |
|---|---|
| `create_customer_in_provider` | `POST /v1/customers` |
| `create_setup_intent_in_provider` | Mandate registration — authorisation transaction creating a **token** (e-mandate / UPI AutoPay / card) |
| `get_payment_method_from_provider` | `GET /v1/customers/:id/tokens/:token_id` |
| `create_payment_intent_in_provider` | `POST /v1/orders` + recurring charge against the saved token |

The mapping is workable because both providers separate "authorise once" from "charge later". The
naming is Stripe's, the semantics survive translation.

### The exception: RBI pre-debit notification

This is the one place the abstraction genuinely leaks, and it is a **behavioural** difference the
trait cannot express.

Under RBI rules for recurring mandates, the customer must be notified **in advance of each debit**
(24 hours is the standard requirement), and debits above the AFA threshold require additional factor
authentication. Stripe's model has no equivalent: `create_payment_intent_in_provider` is expected to
charge *now*.

So a Razorpay implementation of that method **cannot simply charge**. The flow has to become:

```
Meteroid scheduler decides "charge ₹X on date D"
        │
        ├─ D-1 : send pre-debit notification, register intent to debit
        │
        └─ D   : execute debit against token
```

Consequences to design for, not discover later:

- The connector needs its **own scheduling state** — a notification must be sent before Meteroid's
  scheduler fires, so the connector has to be told about the charge a day early. Meteroid's scheduler
  does not natively support "tell the PSP a day ahead".
- Amount changes between notification and debit may invalidate the notification. Usage-based billing
  computed at period end is exactly this shape, so **mid-cycle usage charges need the amount frozen
  a day before debit**, or a different flow.
- Debits above the AFA limit will fail without customer action. The connector must surface that as a
  distinct, recoverable state rather than a generic payment failure.

**This is the highest-risk part of the work.** Confirm the current thresholds and notification
window directly with Razorpay — they have changed more than once, and the numbers should not be
taken from any document written earlier than the day you implement.

---

## 3. Touchpoints — it is not one file

Adding a provider means editing every place the enum is exhaustively matched. Verified locations:

| # | File | What |
|---|---|---|
| 1 | `crates/diesel-models/src/enums.rs:145` | `ConnectorProviderEnum` — **DB enum, needs a Postgres migration** |
| 2 | `crates/meteroid-store/src/domain/enums.rs:141` | Domain enum |
| 3 | `crates/meteroid-store/src/adapters/payment_service_providers.rs` | `PaymentProvider` impl |
| 4 | `crates/meteroid-store/src/services/connectors/` | New `razorpay.rs` beside `stripe.rs` |
| 5 | `crates/razorpay-client/` (new crate) | HTTP client, mirroring `stripe-client/` |
| 6 | `src/adapters/razorpay.rs` | Webhook verify + dispatch (`WebhookAdapter`) |
| 7 | `spec/api/v1` + `src/api/connectors/mapping.rs`, `src/api/customers/mapping.rs` | gRPC enum and mappings |
| 8 | `modules/web/web-app` | Connector selection UI |

Item 1 is the one that bites: a new value in a Postgres enum type is a migration, and it must land
before any code that writes it.

There is no official Razorpay Rust SDK — item 5 is hand-written HTTP against their REST API, the
same way `stripe-client` is.

## 4. Webhook signature

Razorpay signs webhooks with **HMAC-SHA256 over the raw request body**, keyed on the webhook secret,
in the `X-Razorpay-Signature` header.

`WebhookAdapter::verify_webhook` receives `ParsedRequest`, which carries `raw_body: bytes::Bytes`
alongside the parsed `json_body` — so the raw bytes are available. **Verify against `raw_body`,
never against a re-serialised `json_body`**: re-serialising reorders keys and changes whitespace, and
the signature will not match. Use a constant-time comparison.

The same rule already applies in this repository's own
`verifyRazorpayWebhookSignature` (`apps/studio/lib/api/saas/razorpay-billing.ts`) — that
implementation is a good reference for the header name and digest, though it is TypeScript and
covers platform billing, not sub-merchant payments.

---

## 5. Still blocking

Section 1 of PAYMENTS.md is unchanged by choosing Razorpay. "Razorpay" names the provider; it does
not answer **which Razorpay commercial relationship** — Route / Linked Accounts sub-merchant
onboarding versus a partner or reseller arrangement. That decision determines:

- whose `key_id` authenticates each API call (platform's, or the sub-merchant's),
- who is liable for chargebacks,
- whether settlement is direct-to-sub-merchant or split,
- what the connector stores per tenant.

The connector cannot be finished without it, because the answer changes the authentication model on
every single call listed in §2. It is worth settling that with Razorpay's partnerships team before
writing item 5.
