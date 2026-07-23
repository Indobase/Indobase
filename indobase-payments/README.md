# Indobase Payments

**Indobase Payments** is Indobase’s pricing, subscriptions, invoicing, and
usage-billing engine. It is an AGPL-3.0 fork of
[Meteroid](https://github.com/meteroid-oss/meteroid), rebranded for Indobase.

> Customer-facing brand is **Indobase Payments** only. There is no separate
> Meteroid marketing surface. Operators use **Studio login** via a signed
> handoff (`/launch` + `STUDIO_HANDOFF_SECRET`); unauthenticated visits redirect
> to Studio sign-in.

This directory lives **inside the Indobase monorepo** (`Indobase/Indobase`) as an
AGPL boundary — not a separate GitHub repository. Source ships on the same
`staging` / `main` branches as Studio and Builder.

## License

AGPL-3.0 — see [`LICENSE`](./LICENSE) and [`NOTICE.md`](./NOTICE.md).
Renaming the product does **not** remove AGPL obligations. Publish source for
any network-deployed modifications (monorepo path is the published source).

## Relationship to Indobase

| Concern | Owner |
|---|---|
| Plans, metering, invoices, proration | Indobase Payments (this directory) |
| Money movement (cards / UPI / mandates) | Payment adapter — **Stripe today**; **Razorpay later** |
| Indobase platform plan billing (Free/Basic/Pro…) | Studio Razorpay (`apps/studio`) — **not** this product |
| Operator auth | Studio GoTrue session → Payments handoff JWT (`/launch`) |


Monorepo docs: [`docs/INDOBASE-PAYMENTS.md`](../docs/INDOBASE-PAYMENTS.md),
[`docs/PAYMENTS.md`](../docs/PAYMENTS.md),
[`docs/RAZORPAY-CONNECTOR.md`](../docs/RAZORPAY-CONNECTOR.md).

## Quick start (local / staging)

```bash
cd indobase-payments/docker/deploy
cp .env.example .env
# Edit secrets: JWT_SECRET, INTERNAL_API_SECRET, SECRETS_CRYPT_KEY (32 chars), DATABASE_PASSWORD

docker compose -f docker-compose.yml up -d
# Prefer production-ready pins:
# docker compose -f docker-compose.prod.yml --env-file .env up -d
```

Web UI: `http://localhost:3000`  
REST API: `http://localhost:8084`  
gRPC API: `localhost:50061`

## Production deploy

Use [`docker/deploy/docker-compose.prod.yml`](./docker/deploy/docker-compose.prod.yml):

- Digest/version-pinned images (no `:latest` for app services)
- `restart: unless-stopped`
- Healthchecks on critical services
- Traefik labels for `payments.indobase.in` (Vyom control-plane / dedicated host)
- DB / ClickHouse / Kafka not published on the host by default

See **`docs/INDOBASE-PAYMENTS.md`**.

### Branded web image

Upstream `meteroid-web` images still contain Meteroid chrome. For Indobase
branding, **build the web image from this tree**:

```bash
# From monorepo root
docker build -t indobase-payments-web:local \
  -f indobase-payments/modules/web/web-app/Dockerfile \
  indobase-payments/modules/web
```

Point `INDOBASE_PAYMENTS_WEB_IMAGE` (see prod compose) at your registry tag.

Backend API/scheduler/metering may use pinned upstream `ghcr.io/meteroid-oss/*:v1.0.0-rc6`
until Indobase publishes its own builds; env/secrets and UI brand are Indobase.

## Stripe (current adapter)

Keep the built-in Stripe connector for card checkout. Razorpay Recurring
Payments (token/mandate) is documented as the India next step — not implemented
in this phase.

## Studio surface

Studio project page `/project/[ref]/payments` launches Payments with a short-lived
handoff token (`GET /api/platform/projects/[ref]/payments/launch` → Payments
`/launch` → `POST /oauth/studio-handoff`). Operators never use a separate
Meteroid password login.

## AGPL reminder

If you modify and run this as a network service, offer Corresponding Source to
users. Indobase publishes this tree at
`https://github.com/Indobase/Indobase/tree/main/indobase-payments`.
See `NOTICE.md`.

## Upstream

Optional remote for pulls (not a separate Indobase fork repo):

```bash
# From this directory, if you keep a local checkout with remotes:
git remote add upstream https://github.com/meteroid-oss/meteroid.git
```

Do **not** create `Indobase/indobase-payments` on GitHub — this code ships with
the monorepo.
