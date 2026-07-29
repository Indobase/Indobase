# Indobase Helpdesk

Customer support tickets, SLAs, knowledge base, and assignment rules for Indobase organizations and projects — **Helpdesk**. Upstream engine is AGPL; customer UI is Indobase-branded only. See [docs/INDOBASE-ECOSYSTEM-NAMING.md](../docs/INDOBASE-ECOSYSTEM-NAMING.md).

| Host (prod) | Host (staging) |
|---|---|
| `helpdesk.indobase.in` | `helpdesk.indobase.fun` |

## Layout

| Path | Purpose |
|---|---|
| `bridge/` | Node SSO bridge + dev shell (mirrors CRM `/sso/launch`) |
| `frappe-app/indobase_helpdesk/` | Frappe custom app: Studio handoff, org/project → team/queue provisioning |
| `docker/deploy/` | Compose + Traefik for Vyom `.249` |

## Local dev (bridge only)

```bash
cd bridge
npm install
HELPDESK_HANDOFF_SECRET="$(openssl rand -hex 32)" npm run dev
# open http://localhost:8095/sso/health
```

Studio mints `aud=indobase-helpdesk` JWTs; bridge verifies and sets `indobase_helpdesk_session`.

## Full stack (Frappe Helpdesk + bridge)

```bash
cd docker/deploy
cp .env.example .env   # set secrets
docker compose up -d
```

First boot runs Frappe bench init (~5–10 min). Traefik serves `helpdesk.*` → bridge; bridge proxies `/h/*`, `/portal/*`, and `/helpdesk/*` upstream when configured.

See [docs/INDOBASE-HELPDESK.md](../docs/INDOBASE-HELPDESK.md).
