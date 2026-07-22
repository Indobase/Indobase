# Indobase Payments — product overview

Status: **planning** (Coming soon on the project landing page). Nothing is implemented yet.

**Indobase Payments** is a first-party Indobase product: businesses built on Indobase can take
payments from *their own* customers — subscriptions, invoices, usage-based charges — inside the same
project as Builder, Studio, and Analytics.

It is **not** Indobase plan billing. Platform subscriptions (Free / Basic / Pro / Studio) stay on the
existing Razorpay flow in Studio. Indobase Payments is for *your* end users paying *you*.

---

## What customers get

| Capability | Intent |
|---|---|
| Collect INR | Cards, UPI, and other methods via a licensed Indian aggregator |
| Plans & invoices | Subscriptions and one-off invoices owned by the project |
| Payouts | Settlements land in the merchant’s own bank account |
| In-project UI | Onboarding, keys, and payment history live next to Backend Studio |

Brand surfaces (chooser tile, marketing hero “Payments” tile, docs) always say **Indobase Payments**.

---

## Regulatory shape (decides the data model)

Indobase Payments collects money from an Indobase customer’s end users and settles it to that
customer. In India, doing that as a principal is **Payment Aggregator (PA) activity and requires RBI
authorisation**. Using one Indobase-owned Razorpay account so funds land in Indobase’s bank account
would make Indobase an unlicensed PA.

The intended model uses a licensed aggregator’s platform / marketplace product (for example Razorpay
Route or Cashfree Easy Split):

- Every Indobase customer onboarded as a **sub-merchant in their own name**, with their own KYC and
  settlement bank account.
- Funds settle **directly to the sub-merchant**. Indobase orchestrates and never takes custody.
- Any Indobase commission is a platform fee via the aggregator’s split, not custody + re-payout.

**This is not legal advice.** Confirm with counsel and the aggregator’s partnerships team before
implementation. Schema implication: no “Indobase balance” table; every payment object is owned by a
sub-merchant.

**Open question blocking implementation:** which aggregator product, and are we a reseller or a
technology partner? That answer sets onboarding, KYC fields, webhook shapes, and settlement.

---

## Billing engine vs money movement

Indobase Payments owns **what to charge and when** (plans, metering, invoices, proration). The
aggregator **moves the money**.

For Razorpay specifically:

| Model | Who owns the schedule | Fit |
|---|---|---|
| Razorpay **Subscriptions** | Razorpay auto-charges on its schedule | ✗ Collides with Indobase’s billing engine |
| Razorpay **Recurring Payments** (token / mandate) | Indobase decides when to debit | ✓ Correct |

Use token-based Recurring Payments. Indobase computes amount and timing; Razorpay executes against a
registered mandate.

### RBI pre-debit notification

Recurring mandates require **advance notice before each debit** (typically 24 hours) and additional
factor authentication above AFA thresholds. A charge call cannot always mean “debit now”:

```
Indobase decides "charge ₹X on date D"
        │
        ├─ D−1 : send pre-debit notification
        │
        └─ D   : execute debit against token
```

The payments service needs its own scheduling state for that window. Confirm current thresholds with
Razorpay at implementation time.

---

## What is NOT Indobase Payments

`apps/studio/lib/api/saas/razorpay-billing.ts` (and related Studio billing) charges **Indobase’s own
customers** for Indobase plans. Different money owner, different regulatory footing — do not extend
that path into Indobase Payments.

---

## Sequencing

1. Settle aggregator relationship (legal + partnerships). **Blocking.**
2. Sub-merchant onboarding + KYC state in Studio / control plane.
3. Project-scoped payment APIs and webhook ingestion.
4. Product UI — replace the Coming soon tile on the project chooser.

Until step 1 is closed, authentication (platform key vs sub-merchant key), chargeback liability, and
settlement split remain undefined.
