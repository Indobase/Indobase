# Indobase Payments

Product overview for merchant money movement (not Studio org plan billing).

**Status (2026-08):** Dual rail is wired end-to-end in-repo:

| Rail | Operator ask | Studio KYC / aggregator | Engine charges |
|---|---|---|---|
| **India** | Razorpay | Route Linked Account → stakeholder → product config → bank settlements (`POST/PATCH /v2/…`) when Route keys present | Orders + Recurring + webhook settle (`payment.captured` / mandate auth) |
| **International** | Stripe | Connect Account Links when Stripe secret present; Confirm go-live | Stripe connector + Checkout Sessions / PaymentIntents |

OS / Builder agents ask **India (Razorpay)** vs **International (Stripe)**, call
`runtime/ensure` with `settlement_market`, then wire hosted checkout into the site.

Official API map: [PAYMENTS-STRIPE-RAZORPAY.md](./PAYMENTS-STRIPE-RAZORPAY.md).

Recurring Payments / live Route Linked Accounts product-config path is implemented;
commercial Route partnership + live secrets still gate production money.

---

## What operators see

| Collect money | **International cards** (Stripe) + **India settlements** (Razorpay Route) |
| Merchant KYC | Studio onboarding wizard → `saas.project_payment_merchants` |
| Go live | Owner/admin Confirm go-live after KYC submit / review |

Agents ask India (Razorpay) vs International (Stripe) in OS chat, then Enable with
`settlement_market` and wire checkout into the built site.

---

## Settlement rails

| Market | Adapter | Live path |
|---|---|---|
| India settlements | `razorpay_route` | Live `POST /v2/accounts` + stakeholder + product + settlements when Route keys + KYC email/phone/bank present ([docs](https://razorpay.com/docs/api/payments/route/create-linked-account/)) |
| International cards | `stripe` | Connect Account Links via `INDOBASE_PAYMENTS_STRIPE_SECRET_KEY` + [Checkout Sessions](https://docs.stripe.com/api/checkout/sessions/create) after go-live |

| Provider | `StripeSettlementOnboardingProvider` + `RazorpayRouteOnboardingProvider` |

---

## Platform billing vs merchant Payments

`apps/studio/lib/api/saas/razorpay-billing.ts` charges Indobase plans — separate from
merchant Indobase Payments.

---

## Related

- [PAYMENTS-STRIPE-RAZORPAY.md](./PAYMENTS-STRIPE-RAZORPAY.md) — official PSP mapping
- [RAZORPAY-CONNECTOR.md](./RAZORPAY-CONNECTOR.md) — engine Recurring details
- [INDOBASE-PAYMENTS.md](./INDOBASE-PAYMENTS.md) — deploy / ops
