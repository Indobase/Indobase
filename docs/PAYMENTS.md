# Indobase Payments

Product overview for merchant money movement (not Studio org plan billing).

**Status (2026-08):** Merchant checkout is **Studio BYOK only** — operators paste their own
Razorpay (India) or Stripe (international) API keys; agents wire hosted checkout via
`connectGateway` + `wireCheckout`. The legacy Payments product host
(`payments.indobase.in`), Meteroid REST path, Razorpay Route Linked Accounts, and Stripe
Connect Account Links are **not** merchant product paths.

| Rail | Operator ask | Setup | Customer checkout |
|---|---|---|---|
| **India** | Razorpay | PSP dashboard KYC → paste keys in Studio / `connectGateway` | Razorpay Payment Links / Subscriptions (`wireCheckout`) |
| **International** | Stripe | PSP dashboard verification → paste keys | Stripe Checkout Sessions (`wireCheckout`) |

Official API map: [PAYMENTS-STRIPE-RAZORPAY.md](./PAYMENTS-STRIPE-RAZORPAY.md).

---

## What operators see

| Collect money | **International cards** (Stripe) + **India settlements** (Razorpay) |
| Merchant setup | Studio `/project/[ref]/payments` → Connect gateway |
| Go live | Validated BYOK keys (owner/admin) |

Agents ask India (Razorpay) vs International (Stripe) in OS chat, then Ensure with
`settlement_market` and wire checkout into the built site.

---

## Settlement rails

| Market | Adapter id (legacy name) | Live path |
|---|---|---|
| India settlements | `razorpay_route` | BYOK merchant keys → Payment Links / Subscriptions |
| International cards | `stripe` | BYOK secret/publishable keys → Checkout Sessions |

---

## Platform billing vs merchant Payments

`apps/studio/lib/api/saas/razorpay-billing.ts` charges Indobase plans — separate from
merchant BYOK checkout.

---

## Related

- [PAYMENTS-STRIPE-RAZORPAY.md](./PAYMENTS-STRIPE-RAZORPAY.md) — official PSP mapping
- [INDOBASE-PAYMENTS.md](./INDOBASE-PAYMENTS.md) — BYOK status + completed VPS teardown notes
- [RAZORPAY-CONNECTOR.md](./RAZORPAY-CONNECTOR.md) — historical connector notes (parked)
