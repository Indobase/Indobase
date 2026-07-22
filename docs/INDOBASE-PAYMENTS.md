# Indobase Payments — deploy & operate

Status: **phase 1** — AGPL fork of Meteroid, branded **Indobase Payments**,
self-hosted stack ready for prod-like deploy. Razorpay and Studio SSO are
follow-ups.

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
| **Studio** | Operator entry via `/project/[ref]/payments` → deep-link to Payments URL |
| **Platform billing** | Unrelated — Studio Razorpay for Indobase plan subscriptions |

Brand rule: UI, emails, titles, logos say **Indobase Payments** only — zero
Meteroid customer-facing naming.

---

## Production-ready stack

From the monorepo tree (Vyom control-plane **103.190.92.249**):

```bash
cd indobase-payments/docker/deploy
cp .env.example .env
# Set JWT_SECRET, INTERNAL_API_SECRET, SECRETS_CRYPT_KEY (32 chars),
# DATABASE_PASSWORD, CLICKHOUSE_PASSWORD

# Ensure Traefik network exists and matches dokploy-traefik (see below):
docker network create traefik-public 2>/dev/null || true

docker compose -f docker-compose.prod.yml --env-file .env up -d
```

DNS: `payments.indobase.in` and `api.payments.indobase.in` must be **A records to
`.249`** (same host as Studio/Builder). Pointing them at the tenant data-plane
(`.248`) yields Traefik’s default/self-signed cert (`NET::ERR_CERT_AUTHORITY_INVALID`).

### Image pins

Prod compose pins Meteroid **`sha-80512c2`** (git tag `v1.0.0-rc6` — GHCR does not
publish a `v1.0.0-rc6` image tag). Override with Indobase-built tags when ready:

| Env | Default |
|---|---|
| `INDOBASE_PAYMENTS_WEB_IMAGE` | `ghcr.io/meteroid-oss/meteroid-web:sha-80512c2` |
| `INDOBASE_PAYMENTS_API_IMAGE` | `ghcr.io/meteroid-oss/meteroid-api:sha-80512c2` |
| … | … |

**Rebuild the web image from this tree** so Indobase logos/titles ship in the
container (upstream web image still has Meteroid chrome until you publish your
own):

```bash
# From monorepo root
docker build -t roshanraghavander/indobase-payments-web:<sha> \
  -f indobase-payments/modules/web/web-app/Dockerfile \
  indobase-payments/modules/web
# set INDOBASE_PAYMENTS_WEB_IMAGE=...
```

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

Env (Studio deploy):

```bash
NEXT_PUBLIC_INDOBASE_PAYMENTS_URL=https://payments.indobase.in
```

Project page `/project/[ref]/payments` links operators into that URL while
stating they remain on the Studio session. **SSO/handoff** (embed or token
exchange so Payments does not show a second login) is documented as follow-up —
phase 1 does not invent a separate Payments marketing brand or identity product.

---

## Next steps

1. **Razorpay** — implement Recurring Payments (token/mandate) connector; keep
   Stripe until India path is live. See [RAZORPAY-CONNECTOR.md](./RAZORPAY-CONNECTOR.md).
2. **Studio SSO** — handoff from Studio GoTrue / org membership into Payments
   (same session messaging already on the Studio page).
3. **Publish CI images** — build/push `indobase-payments-web` (and optionally
   API) from `indobase-payments/` on each release.
4. **Merchant KYC / Route** — after aggregator commercial relationship is
   settled (see PAYMENTS.md regulatory notes).
