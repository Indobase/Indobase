# Indobase Domains

Customer-facing product: **Domains** — search, buy (INR via Razorpay), and manage domains for a Studio project.

Registrar integration stays **server-only** on Studio; this app never exposes provider branding.

## Architecture (Option A)

```
Studio chooser → GET /api/platform/projects/:ref/domains/launch
              → redirect domains.indobase.in/sso/launch#token=<handoff JWT>

indobase-domains bridge
  ├─ SSO: verify aud=indobase-domains, set session cookie
  ├─ Console SPA: search / Razorpay checkout / owned domains list
  └─ /api/* proxy → Studio /api/platform/projects/:ref/domains/*
        Authorization: Bearer <indobase-domains-api JWT>
```

Domain logic (name.com, Razorpay orders, `saas.domain_registrations`) remains in Studio:

- `apps/studio/lib/api/saas/namecom-client.ts`
- `apps/studio/lib/api/saas/domains-service.ts`
- `apps/studio/lib/api/saas/domains-purchase.ts`

## Local dev

```bash
# Terminal 1 — Studio (with NAMECOM_* + RAZORPAY_* in env)
cd apps/studio && pnpm dev

# Terminal 2 — Domains console
cd indobase-domains/console && npm install && npm run dev

# Terminal 3 — Domains bridge (proxies to Studio)
cd indobase-domains/bridge && npm install
DOMAINS_HANDOFF_SECRET='your-32-char-minimum-secret-here!!' \
STUDIO_PUBLIC_URL=http://localhost:8082 \
STUDIO_INTERNAL_URL=http://localhost:8082 \
PORT=8094 npm run dev
```

Open Domains from Studio chooser (requires matching `DOMAINS_HANDOFF_SECRET` on Studio).

## SSO contract

| Field | Value |
|-------|-------|
| JWT `aud` | `indobase-domains` |
| Launch path | `/sso/launch?project_ref=…&from=studio#token=…` |
| Session cookie | `indobase_domains_session` (HttpOnly, 12h) |
| Studio API bearer `aud` | `indobase-domains-api` (15m, bridge → Studio) |
| Shared secret | `DOMAINS_HANDOFF_SECRET` (fallback: `STUDIO_HANDOFF_SECRET`) |

Handoff payload matches other ecosystem products (`sub`, `email`, `project_ref`, `organization_slug`, `role`, …) — see `apps/studio/lib/api/saas/product-handoff.ts`.

## Project attach

1. Purchase completes → row in `saas.domain_registrations` with `project_ref`
2. Registrar NS set to `INDOBASE_DOMAIN_NAMESERVERS` (default `ns1.indobase.in,ns2.indobase.in`)
3. User attaches hostname in Studio **Settings → Custom Domains** (existing Basic+ flow)
4. Console links **Attach in Studio** → `studio…/project/:ref/settings/general#custom-domains`

## Deploy sketch

- Host: `domains.indobase.in` / `domains.indobase.fun` on Vyom `.249`
- See `docker/deploy/docker-compose.yml` and `traefik-indobase-domains.yml`
- Image build: `docker build -f indobase-domains/Dockerfile indobase-domains`

## Docs

Full registrar + env reference: [`docs/INDOBASE-DOMAINS.md`](../docs/INDOBASE-DOMAINS.md)
