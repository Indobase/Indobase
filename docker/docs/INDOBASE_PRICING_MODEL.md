# Indobase pricing model vs per-project SaaS

## Problem we solve (Gap 2)

Many platforms bill **per project** at a flat monthly rate. Agencies and product teams that run staging, preview, and production as separate projects multiply cost before shipping features.

## Indobase defaults

- **INR-first** prices in `apps/studio/lib/api/saas/indobase-billing-plans.ts` (Razorpay).
- **Organizations** own many **projects**; metering and limits are designed around org + plan, not “each project is another \$25”.

## Operator overrides (self-host / white-label)

Without changing code, you can set:

| Env var | Purpose |
|---------|---------|
| `INDOBASE_FREE_PLAN_PRICE_INR` | Override Starter monthly (usually `0`). |
| `INDOBASE_PRO_PLAN_PRICE_INR` | Override Pro monthly (default `2499`). |
| `INDOBASE_TEAM_PLAN_PRICE_INR` | Override Business monthly (default `49999`) — **use this to close the mid-market gap** vs Supabase’s \$25 → \$599 cliff. |
| `INDOBASE_ENTERPRISE_PLAN_PRICE_INR` | Only if you expose a numeric enterprise list price. |

Invalid or empty values fall back to the built-in defaults. Restart Studio after changes.

## Product copy (for marketing)

Use honest wording:

- “**Multiple projects per organization** on paid tiers — staging and production don’t each pay a full Supabase Pro project fee.”
- “**Predictable INR** billing with Razorpay; optional annual discount in-plan.”
