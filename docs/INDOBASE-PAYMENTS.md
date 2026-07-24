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
# Optional explicit REST base (defaults to api.<payments-host>)
INDOBASE_PAYMENTS_API_URL=https://api.payments.indobase.in
PAYMENTS_HANDOFF_SECRET=<same-as-payments-api-≥32-chars>
# or reuse BUILDER_HANDOFF_SECRET

# Optional transitional fallback: tenant API key instead of Studio MCP JWT
# (prefer JWT once Payments image includes studio MCP auth)
# INDOBASE_PAYMENTS_API_KEY=pv_…
```

Project page `/project/[ref]/payments` → `GET /api/platform/projects/[ref]/payments/launch`
→ Payments `/launch` → session. Owners/admins only.

---

## MCP (Builder ↔ Payments)

Studio exposes a streamable-HTTP MCP server that proxies Indobase Payments REST,
scoped to the Studio project’s organization (owners/admins only).

```mermaid
sequenceDiagram
  participant Builder as builder.indobase.in
  participant Studio as studio.indobase.in
  participant PayAPI as api.payments.indobase.in

  Builder->>Studio: POST /api/mcp/payments?project_ref=…
  Note over Builder,Studio: Bearer Builder MCP token (same as /api/mcp)
  Studio->>Studio: Verify token, resolve org role (owner/admin)
  Studio->>Studio: Mint aud=indobase-payments-mcp JWT (15 min)
  Studio->>PayAPI: REST /api/v1/* with MCP JWT (or API key fallback)
  PayAPI-->>Studio: JSON
  Studio-->>Builder: MCP tool result
```

### Endpoints

| Surface | URL |
|---|---|
| Studio Payments MCP | `https://studio.indobase.in/api/mcp/payments?project_ref=<ref>` |
| Alias rewrite | `/mcp/payments` → `/api/mcp/payments` |
| Payments REST | `https://api.payments.indobase.in/api/v1/*` |

Auth (Studio MCP): same as database MCP — `Authorization: Bearer <builder-mcp-token>` or Studio user JWT.

Auth (Payments REST): Bearer `aud=indobase-payments-mcp` JWT signed with `PAYMENTS_HANDOFF_SECRET` / `STUDIO_HANDOFF_SECRET`, **or** a classic Payments API key via Studio env `INDOBASE_PAYMENTS_API_KEY`.

### Tools

| Tool | Access |
|---|---|
| `list_plans` / `get_plan` | read |
| `list_customers` / `get_customer` | read |
| `list_invoices` / `get_invoice` | read |
| `list_subscriptions` / `get_subscription` | read |
| `list_product_families` | read |
| `create_customer` | write |
| `create_plan` | write (full CreatePlanRequest body) |
| `create_subscription` | write (full CreateSubscriptionRequest body) |

Pass `?read_only=true` to omit write tools. Invoices are subscription-generated in Payments REST — there is no `create_invoice` tool.

### Builder auto-wire

When Builder is launched from Studio (`studio_handoff` + MCP token), chat registers two MCP servers:

1. `indobase` → `/api/mcp` (database / development / debugging)
2. `indobase-payments` → `/api/mcp/payments` (this surface)

No extra Builder env is required beyond the existing Studio handoff / MCP token.

### Enable checklist

1. Studio + Payments share `PAYMENTS_HANDOFF_SECRET` (≥32 chars).
2. Deploy Payments API image that includes Studio MCP JWT auth in REST middleware.
3. Redeploy Studio (and Builder) so `/api/mcp/payments` and auto-wire are live.
4. Open Payments once from Studio for the org (provisions the `ib-*` Payments org/tenant).
5. From Builder (linked project): ask the agent to list plans/customers — it should call `indobase-payments` tools.

### Cursor / external agents

```json
{
  "mcpServers": {
    "indobase-payments": {
      "type": "streamable-http",
      "url": "https://studio.indobase.in/api/mcp/payments?project_ref=YOUR_REF",
      "headers": {
        "Authorization": "Bearer YOUR_STUDIO_OR_BUILDER_MCP_TOKEN"
      }
    }
  }
}
```

---

## Next steps

1. **Razorpay** — implement Recurring Payments (token/mandate) connector; keep
   Stripe until India path is live. See [RAZORPAY-CONNECTOR.md](./RAZORPAY-CONNECTOR.md).
2. **Publish CI images** — build/push `indobase-payments-web` and
   `indobase-payments-api` from `indobase-payments/` on each release.
3. **Live Route Linked Accounts** — replace the Studio KYC stub provider
   (`merchant-kyc-provider.ts`) once the aggregator commercial relationship is
   settled. Schema + wizard already store KYC state and `aggregator_account_id`.
