# Indobase Payments — deploy & operate

Status: **phase 1 + Studio SSO** — AGPL fork of Meteroid, branded **Indobase
Payments**, self-hosted stack with Studio session handoff (no Meteroid login).

## Location (in monorepo)

AGPL boundary directory inside **Indobase/Indobase** (not a separate GitHub repo):

- Path: [`indobase-payments/`](../indobase-payments/)
- Published source: `https://github.com/Indobase/Indobase/tree/main/indobase-payments`
- Upstream: `https://github.com/meteroid-oss/meteroid` (AGPL-3.0)

See also [PAYMENTS.md](./PAYMENTS.md) (product) and
[RAZORPAY-CONNECTOR.md](./RAZORPAY-CONNECTOR.md) (India money movement — later).

---

## What this is

| Layer | Role |
|---|---|
| **Indobase Payments** | Plans, subscriptions, metering, invoices, proration (Meteroid-derived engine) |
| **Payment adapter** | Stripe (working today). Razorpay Recurring Payments next |
| **Studio** | Operator IdP — `/project/[ref]/payments` mints a short-lived handoff JWT |
| **Platform billing** | Unrelated — Studio Razorpay for Indobase plan subscriptions |

Brand rule: UI, emails, titles, logos say **Indobase Payments** only — zero
Meteroid customer-facing naming. There is **no** Payments email/password login.

---

## Studio → Payments SSO (handoff)

Same pattern as Builder `/launch`:

```mermaid
sequenceDiagram
  participant Studio as studio.indobase.in
  participant LaunchAPI as /api/platform/.../payments/launch
  participant Web as payments.indobase.in/launch
  participant API as api.payments.indobase.in

  Studio->>LaunchAPI: GET (Studio session cookie / Bearer)
  LaunchAPI->>LaunchAPI: Sign HS256 JWT (aud=indobase-payments, 5 min)
  LaunchAPI-->>Studio: { url: …/launch?project_ref=…#token=… }
  Studio->>Web: iframe / navigate
  Web->>API: GET /oauth/studio-handoff?token=…
  API->>API: Verify secret, find-or-create user + org
  API-->>Web: Redirect /oauth_success?token=session
  Web->>Web: Persist session → dashboard
```

### Env (must match on both sides, ≥32 chars)

| Side | Variables |
|---|---|
| Studio | `PAYMENTS_HANDOFF_SECRET` (preferred) or `BUILDER_HANDOFF_SECRET` / `AUTH_JWT_SECRET` |
| Payments API | `STUDIO_HANDOFF_SECRET` or `PAYMENTS_HANDOFF_SECRET` |

Unauthenticated visits to Payments (`/`, `/login`, `/registration`, …) redirect
to Studio sign-in (`VITE_STUDIO_URL`, default `https://studio.indobase.in`).

**Images:** upstream `ghcr.io/meteroid-oss/meteroid-{web,api}` do **not** include
handoff. Build from this tree:

```bash
# From monorepo root — web
docker build -t indobase-payments-web:local \
  -f indobase-payments/modules/web/web-app/Dockerfile \
  indobase-payments

# API (arm64 Mac example)
docker build -t indobase-payments-api:local \
  -f indobase-payments/modules/meteroid/api.Dockerfile \
  --build-arg MOLD_ARCH=aarch64 \
  --build-arg PROTO_ARCH=aarch_64 \
  --build-arg GRPC_HEALTH_PROBE_ARCH=arm64 \
  --build-arg PROFILE=release \
  indobase-payments
```

Set `INDOBASE_PAYMENTS_WEB_IMAGE` / `INDOBASE_PAYMENTS_API_IMAGE` in deploy `.env`.

---

## Production-ready stack

From the monorepo tree (Vyom control-plane **103.190.92.249**):

```bash
cd indobase-payments/docker/deploy
cp .env.example .env
# Set JWT_SECRET, INTERNAL_API_SECRET, SECRETS_CRYPT_KEY (32 chars),
# DATABASE_PASSWORD, CLICKHOUSE_PASSWORD, PAYMENTS_HANDOFF_SECRET (match Studio)

# Ensure Traefik network exists and matches dokploy-traefik (see below):
docker network create traefik-public 2>/dev/null || true

docker compose -f docker-compose.prod.yml --env-file .env up -d
```

DNS: `payments.indobase.in` and `api.payments.indobase.in` must be **A records to
`.249`** (same host as Studio/Builder). Pointing them at the tenant data-plane
(`.248`) yields Traefik’s default/self-signed cert (`NET::ERR_CERT_AUTHORITY_INVALID`).

### Image pins

Prod compose defaults to Meteroid **`sha-80512c2`** until you override with
Indobase-built tags (required for SSO):

| Env | Default |
|---|---|
| `INDOBASE_PAYMENTS_WEB_IMAGE` | `ghcr.io/meteroid-oss/meteroid-web:sha-80512c2` |
| `INDOBASE_PAYMENTS_API_IMAGE` | `ghcr.io/meteroid-oss/meteroid-api:sha-80512c2` |
| … | … |

### TLS / Traefik

`docker-compose.prod.yml` labels:

- Web: `Host(payments.indobase.in)` → port 80
- REST API: `Host(api.payments.indobase.in)` → port 8084

Assumes external Traefik (`dokploy-traefik` on Vyom `.249`) on network
`traefik-public` (or the Dokploy overlay in use) with entrypoint `websecure` and
cert resolver matching Studio (override via `TRAEFIK_*` env). Attach the stack to
the same Traefik Docker network used by Studio/Builder.

### Health / restart

- `restart: unless-stopped` on long-running services
- Postgres, ClickHouse, Redpanda, API: healthchecks
- DB / ClickHouse / Kafka: **not** published on the host in prod compose

### AGPL

Directory includes `LICENSE` + `NOTICE.md`. Corresponding Source is the monorepo
path above. Network users of modified builds must be able to obtain Corresponding
Source. This is not legal advice.

---

## Studio wiring

```bash
NEXT_PUBLIC_INDOBASE_PAYMENTS_URL=https://payments.indobase.in
PAYMENTS_HANDOFF_SECRET=<same-as-payments-api-≥32-chars>
# or reuse BUILDER_HANDOFF_SECRET
```

Project page `/project/[ref]/payments` → `GET /api/platform/projects/[ref]/payments/launch`
→ Payments `/launch` → session. Owners/admins only.

---

## Next steps

1. **Razorpay** — implement Recurring Payments (token/mandate) connector; keep
   Stripe until India path is live. See [RAZORPAY-CONNECTOR.md](./RAZORPAY-CONNECTOR.md).
2. **Publish CI images** — build/push `indobase-payments-web` and
   `indobase-payments-api` from `indobase-payments/` on each release.
3. **Merchant KYC / Route** — after aggregator commercial relationship is
   settled (see PAYMENTS.md regulatory notes).
