# Indobase CRM

Leads, deals, Kanban, and sales pipelines for Indobase organizations and projects — **CRM**. Upstream engine is AGPL; customer UI is Indobase-branded only. See [docs/INDOBASE-ECOSYSTEM-NAMING.md](../docs/INDOBASE-ECOSYSTEM-NAMING.md).

| Host (prod) | Host (staging) |
|---|---|
| `crm.indobase.in` | `crm.indobase.fun` |

## Layout

| Path | Purpose |
|---|---|
| `bridge/` | Node SSO bridge + dev shell (mirrors Discuss `/sso/launch`) |
| `frappe-app/indobase_crm/` | Frappe custom app: Studio handoff, org/project → team/pipeline provisioning |
| `docker/deploy/` | Compose + Traefik for Vyom `.249` |

## Local dev (bridge only)

```bash
cd bridge
npm install
CRM_HANDOFF_SECRET="$(openssl rand -hex 32)" npm run dev
# open http://localhost:8094/sso/health
```

Studio mints `aud=indobase-crm` JWTs; bridge verifies and sets `indobase_crm_session`.

## Full stack (Frappe CRM + bridge)

```bash
cd docker/deploy
cp .env.example .env   # set secrets
docker compose up -d
```

First boot runs Frappe bench init (~5–10 min). Traefik serves `crm.*` → bridge; bridge proxies `/c/*` and `/crm/*` to upstream when configured.

See [docs/INDOBASE-CRM.md](../docs/INDOBASE-CRM.md).
