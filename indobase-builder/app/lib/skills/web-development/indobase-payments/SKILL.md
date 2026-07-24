---
name: indobase-payments
description: Add Indobase Payments pricing, checkout, and customer portal to Builder apps using the indobase-payments MCP and hosted checkout/portal URLs.
user-invocable: false
risk: safe
source: Indobase first-party
date_added: "2026-07-24"
---

# Indobase Payments (Builder)

Ship merchant billing (plans, subscriptions, checkout, customer portal) with **Indobase Payments** — not Stripe Checkout.js, Shopify billing, or Studio plan billing (Razorpay for Indobase Free/Pro).

## When to use

- User asks for payments, checkout, pricing page, subscribe, billing portal, or customer portal
- Mentions Indobase Payments, Stripe (as merchant money adapter), or Razorpay for *their* customers
- App needs plan cards + “Subscribe” / “Manage billing” that actually work after publish

## Do not confuse

| Product | Who pays whom | Builder role |
|---|---|---|
| **Indobase Payments** | End customer → merchant | This skill + `indobase-payments` MCP |
| Studio plan billing | Merchant → Indobase | Never codegen this |
| Raw Stripe / Shopify | Third-party | Only if user **explicitly** refuses Indobase Payments |

## MCP tools (`indobase-payments`)

Use **only** these tool names (never invent `charge_card`, `stripe_checkout`, `open_portal`, etc.):

**Read:** `list_product_families`, `list_plans`, `get_plan`, `list_customers`, `get_customer`, `list_subscriptions`, `get_subscription`, `list_invoices`, `get_invoice`, `list_checkout_sessions`, `get_checkout_session`

**Write (follow-up turns, after first scaffold):** `create_customer`, `create_plan`, `create_subscription`, `create_checkout_session`, `create_portal_token`

Live charge tools (`create_checkout_session`, `create_subscription`) require the Studio project merchant KYC status **`verified`**. If the tool errors on KYC, tell the user to finish `/project/[ref]/payments` → confirm Stripe go-live.

**First scaffold turn:** MCP is intentionally off — generate UI + wiring with placeholders or plan data from the conversation; call MCP on the next turn to create real plans/sessions.

## Codegen contract (Vite / WebContainer apps)

1. **Pricing page** — plan cards from `list_plans` (or labeled placeholders). CTA starts checkout.
2. **Checkout** — do **not** put Payments API secrets in `VITE_*`. Prefer:
   - Redirect to hosted checkout URL from `create_checkout_session` (`session.checkout_url` → `https://payments.indobase.in/checkout?token=…`), **or**
   - Server/edge proxy (Indobase Edge Function) that calls Studio/Payments with a secret and returns `{ checkout_url }`.
3. **Customer portal** — `create_portal_token` → open `{portal_url}/portal/customer?token=…` (or embed). Mint tokens server-side only.
4. **Settlement visibility** — after payment, `get_invoice` shows paid/settled status once Stripe webhooks land.

Env for the **tenant app** stays `VITE_INDOBASE_URL` / `VITE_INDOBASE_ANON_KEY`. Payments host for redirects: `https://payments.indobase.in` (or project-documented override). Never hardcode Stripe publishable keys as the default path.
