# Indobase Payments — status

**Status (2026-08):** Merchant checkout is **Studio BYOK** (Razorpay / Stripe keys in
SaaS). Agents use `connectGateway` + `wireCheckout` (or Studio MCP
`/api/mcp/payments`). There is **no** separate Payments product dashboard for the
operator path.

The legacy AGPL engine tree (`indobase-payments/`) was removed from the monorepo
after the Vyom `.249` Compose stack was stopped. Studio no longer SSO-launches
`payments.indobase.in` or proxies that engine for agent checkout. Platform org
plan billing (`razorpay-billing.ts`) is unrelated and stays.

See also [PAYMENTS.md](./PAYMENTS.md) and [PAYMENTS-STRIPE-RAZORPAY.md](./PAYMENTS-STRIPE-RAZORPAY.md).

---

## Operator path (current)

| Step | Where |
|---|---|
| Choose India vs International | OS chat / ensure `settlement_market` |
| PSP KYC + API keys | Razorpay / Stripe dashboards |
| Paste keys | Studio `/project/[ref]/payments` or OS `connectGateway` |
| Checkout URL | OS `wireCheckout` / MCP `create_checkout_session` |

Compatibility: `GET /api/platform/projects/[ref]/payments/launch` returns the
Studio Payments hub URL (`mode: studio_byok`), not a product SSO token.

---

## What remains in-repo

| Path | Role |
|---|---|
| Studio BYOK | `merchant-kyc`, `merchant-psp-checkout`, `payments-wire-checkout`, `payments-mcp-byok-server` |
| Platform billing | Org Razorpay for Indobase SaaS plans |

---

## VPS teardown (done 2026-08-09)

On `root@103.190.92.249`:

```bash
cd /opt/indobase-payments/docker/deploy
docker compose -f docker-compose.prod.yml --env-file .env down --remove-orphans
```

- No Swarm `payment|meteroid` services existed; stack was Compose + Traefik Docker labels.
- No `/etc/dokploy/traefik/dynamic/indobase-payments.yml` (routes came from container labels).
- After stop: `payments.indobase.in` / `api.payments.indobase.in` → Traefik **404**; Studio health OK.
- DNS A records for `payments` / `api.payments` still point at `.249` (optional park/remove).
- `/opt/indobase-payments` left on disk with a `TEARDOWN-2026-08-09.txt` marker (do not `compose up`).

---

## Branding

Customer UI: **Indobase Payments** / Studio Payments hub only. Never show upstream
engine product chrome in operator-facing strings.
