---
name: indobase-payments
description: Add merchant Razorpay/Stripe BYOK checkout to Builder apps using connectGateway / wireCheckout (or Studio payments MCP) for hosted checkout_url CTAs.
user-invocable: false
risk: safe
source: Indobase first-party
date_added: "2026-07-24"
---

# Indobase Payments (Builder)

Ship merchant checkout with the operator’s own **Razorpay** (India) or **Stripe** (international) keys stored in Studio — not Studio plan billing, and not a separate billing-engine dashboard.

## When to use

- User asks for payments, checkout, pricing page, subscribe, Buy CTA, or billing
- Mentions Razorpay or Stripe for *their* customers
- App needs plan cards + “Subscribe” / “Buy” that redirect to a real hosted checkout URL

## Ask → rail → wire into the app

Follow official PSP docs (mapped in repo `docs/PAYMENTS-STRIPE-RAZORPAY.md`):

1. Ask **India (Razorpay)** vs **International (Stripe)** (or infer geography).
2. OS/Studio ensure with `settlement_market: "india"` or `"international"`.
3. Operator finishes KYC on the Razorpay/Stripe dashboard and pastes API keys once via OS **`connectGateway`** or Studio **Connect gateway** (keys stay encrypted in Studio).
4. Create hosted checkout via OS **`wireCheckout`** or MCP **`create_checkout_session`** (`plan_name` + `price` + `customer_email`; `mode: "one_time"` for Buy).
5. Patch Subscribe/Buy CTAs to the returned `checkout_url` only — never invent a URL.

Under the hood:

- India: Razorpay Payment Links / Subscriptions
- International: Stripe Checkout Sessions

## Do not confuse

| Product | Who pays whom | Builder role |
|---|---|---|
| Merchant BYOK checkout | End customer → merchant (via Razorpay/Stripe) | This skill + OS/MCP tools |
| Studio plan billing | Merchant → Indobase | Never codegen this |

## MCP / OS tools

Prefer OS when in Indobase OS:

- **connectGateway** — paste validated keys
- **wireCheckout** — returns `checkout_url`

Studio MCP (`/api/mcp/payments`): `get_gateway_status`, `connect_gateway`, `connect_india_settlements`, `connect_international_cards`, `create_checkout_session`.

Live checkout requires gateway keys connected. If tools error with gateway_not_ready, send the user back to paste keys.

**First scaffold turn:** generate UI + CTA placeholders; call connect/wire on the next turn with real keys/price.

## Codegen contract (Vite / WebContainer apps)

1. **Pricing / shop page** — plan or product cards from conversation / catalog. CTA starts checkout.
2. **Checkout** — do **not** put PSP secrets in `VITE_*`. Redirect to `checkout_url` from wireCheckout / create_checkout_session (or an edge proxy that calls Studio and returns `{ checkout_url }`).
3. Prefer hosted Payment Link / Checkout Session URLs over embedding Key Secrets or raw Stripe.js.

Env for the **tenant app** stays `VITE_INDOBASE_URL` / `VITE_INDOBASE_ANON_KEY`.
