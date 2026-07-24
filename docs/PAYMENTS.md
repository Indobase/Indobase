# Indobase Payments — product overview

Status: **engine live + Studio SSO + merchant KYC onboarding**. Razorpay money
movement connector is next.

**Indobase Payments** is a first-party Indobase product: businesses built on Indobase
can take payments from *their own* customers — subscriptions, invoices, usage-based
charges — alongside Builder, Studio, and Analytics.

It is **not** Indobase plan billing. Platform subscriptions (Free / Basic / Pro /
Studio) stay on the existing Razorpay flow in Studio. Indobase Payments is for
*your* end users paying *you*.

Engine source (AGPL-3.0 boundary inside the monorepo, separate from proprietary
Studio/Builder apps): [`indobase-payments/`](../indobase-payments/) —
see [INDOBASE-PAYMENTS.md](./INDOBASE-PAYMENTS.md) for deploy.

---

## What customers get

| Capability | Intent |
|---|---|
| Billing engine | Plans, metering, invoices, proration (Indobase Payments / Meteroid fork) |
| Collect money | Stripe adapter today; **Razorpay Recurring Payments later** (INR / UPI) |
| Payouts | Settlements to the merchant’s own bank account via the licensed aggregator |
| Merchant KYC | Studio onboarding wizard → `saas.project_payment_merchants` (Route-shaped) |
| In-project UI | Studio `/project/[ref]/payments` → KYC hub + signed handoff → Payments dashboard |
| Access | **Studio login only.** No Meteroid email/password; unauthenticated Payments visits redirect to Studio |

Brand surfaces always say **Indobase Payments** — never Meteroid in customer-facing UI.

---

## Auth — same Studio account

Indobase Payments is a product surface of Indobase, not a separate SaaS brand.

- Operators use existing Studio **sign-up / sign-in** (`studio.indobase.in`).
  No second password, no Payments-only marketing portal.
- Studio mints a short-lived HS256 JWT (`aud=indobase-payments`); Payments
  `GET /oauth/studio-handoff` verifies it and creates/links a session.
- Authorization: org **owner/admin** only (Studio gate + token `role` claim).
- Merchant KYC is **business verification**, not a new Indobase login.

End-customers paying a merchant never use Studio auth — they pay via checkout
hosted by Indobase Payments + the payment adapter.

---

## Merchant KYC / sub-merchant onboarding

Studio stores a **project-scoped** merchant profile so India marketplace-style
onboarding can land before live Razorpay Route APIs.

| Piece | Location |
|---|---|
| Schema | `saas.project_payment_merchants` — KYC status, business + bank fields, document metadata, `aggregator_account_id` placeholder |
| APIs | `GET` / `PATCH` / `POST` (submit) `/api/platform/projects/[ref]/payments/merchant` |
| UI | `/project/[ref]/payments` — wizard (business → bank → documents → review) |
| Provider | `merchant-kyc-provider.ts` — Route/Linked-Accounts-shaped stub; plugs in when Razorpay keys exist |

**KYC statuses:** `draft` → `submitted` / `under_review` → `verified` | `rejected`.

**Soft gate:** owners/admins can always open the Payments dashboard (browse plans,
invoices). **Go live / collect payments** requires `kyc_status = verified`. Bank
account numbers are encrypted at rest; APIs return masked PAN and last-4 only.

Settlements are intended to the merchant’s own account via a licensed aggregator.
**Indobase does not take custody of funds.** This is not legal advice.

---

## Billing engine vs money movement

Indobase Payments owns **what to charge and when**. The payment adapter
**moves the money**.

| Adapter | Status |
|---|---|
| Stripe | Supported by the engine today (keep for non-India / interim) |
| Razorpay Recurring Payments (token / mandate) | **Next** — see [RAZORPAY-CONNECTOR.md](./RAZORPAY-CONNECTOR.md) |
| Razorpay Subscriptions (Razorpay-owned schedule) | Do **not** use — collides with Indobase’s billing engine |

### Regulatory shape (India)

Collecting as a principal can be Payment Aggregator activity. Intended model:
licensed aggregator platform / marketplace (e.g. Razorpay Route) with
sub-merchants in their own name; Indobase orchestrates and does not take custody.

**This is not legal advice.** Confirm with counsel and the aggregator before
implementation.

---

## What is NOT Indobase Payments

`apps/studio/lib/api/saas/razorpay-billing.ts` (and related Studio billing) charges
**Indobase’s own customers** for Indobase plans. Different money owner — do not
extend that path into Indobase Payments.

---

## Sequencing

1. ~~Stand up Indobase Payments engine (this fork) + Studio deep-link~~ **done**
2. ~~Studio SSO / session handoff into Payments~~ **done**
3. ~~Sub-merchant KYC / onboarding UI in Studio~~ **done** (stub aggregator; live Route later)
4. Razorpay Recurring Payments connector + pre-debit notification scheduling
5. Project-scoped payment APIs and webhook ingestion under Studio session

AGPL: publish fork source (`NOTICE.md` in the payments repo). Renaming does not
remove AGPL obligations.
