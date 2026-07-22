# Indobase Payments — product overview

Status: **phase 1 engine live as self-hosted Indobase Payments** (Meteroid-derived
AGPL fork). Studio surface deep-links to the Payments app. Razorpay money movement
and Studio SSO handoff are next.

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
| In-project UI | Studio `/project/[ref]/payments` deep-links to Payments; same Studio session messaging |
| Access (target) | **No separate Payments marketing brand.** Operators use Studio login; SSO/handoff is follow-up |

Brand surfaces always say **Indobase Payments** — never Meteroid in customer-facing UI.

---

## Auth — same Studio account (target)

Indobase Payments is a product surface of Indobase, not a separate SaaS brand.

- **Target:** operators use existing Studio **sign-up / sign-in** (`studio.indobase.in`).
  No second password, no Payments-only marketing portal.
- **Phase 1:** self-hosted Payments stack may show its own login until Studio
  SSO/handoff ships. Studio still frames Payments as the same Indobase product.
- Authorization should map to org / project membership (handoff design = follow-up).
- Merchant KYC is **business verification**, not a new Indobase login.

End-customers paying a merchant never use Studio auth — they pay via checkout
hosted by Indobase Payments + the payment adapter.

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

1. ~~Stand up Indobase Payments engine (this fork) + Studio deep-link~~ **phase 1**
2. Studio SSO / session handoff into Payments (no second operator identity)
3. Razorpay Recurring Payments connector + pre-debit notification scheduling
4. Sub-merchant KYC / onboarding UI attached to org session
5. Project-scoped payment APIs and webhook ingestion under Studio session

AGPL: publish fork source (`NOTICE.md` in the payments repo). Renaming does not
remove AGPL obligations.
