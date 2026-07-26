# Indobase Design v2 (Canva-class)

**Staging host:** `studio-design.indobase.fun` (Vyom `.249`)  
**Prod:** unchanged — Penpot remains on `design.indobase.in` / `design.indobase.fun` until cutover.

This is the Fabric.js / JSON editor in `indobase-design-v2/`. It is a **separate** compose
project (`indobase-design-v2`) from the Penpot stack at `/opt/indobase-design`. Do not share
container names, Traefik router names, or volumes with Penpot.

## Studio wiring (staging)

Hostinger staging Studio (`studio.indobase.fun`) sets:

```bash
INDOBASE_DESIGN_URL=https://studio-design.indobase.fun
NEXT_PUBLIC_INDOBASE_DESIGN_URL=https://studio-design.indobase.fun
DESIGN_HANDOFF_SECRET=<same as /opt/indobase-staging/env/handoff.secret>
```

`deploy-staging-hostinger.sh` upserts these automatically. Prod Swarm Studio on `.249` still points
at `https://design.indobase.in` (Penpot).

## Deploy (Vyom .249)

```bash
# From a machine with the repo + SSH key:
rsync -az --delete \
  --exclude node_modules --exclude dist --exclude .env \
  indobase-design-v2/ root@103.190.92.249:/opt/indobase-design-v2/

ssh root@103.190.92.249
cd /opt/indobase-design-v2/docker/deploy
cp .env.example .env   # fill DESIGN_HANDOFF_SECRET + DB_PASSWORD
# DESIGN_HANDOFF_SECRET must match Hostinger staging Studio handoff.secret
docker compose --env-file .env up -d --build
```

DNS: `studio-design.indobase.fun` A → `103.190.92.249`.

## Smoke

```bash
curl -sS https://studio-design.indobase.fun/sso/health
curl -sSI https://studio-design.indobase.fun/ | head -5   # 302 → Studio sign-in
# From Studio (staging): Project → Open Design → editor loads, save, Export PNG
```

## Cutover to prod (needs explicit approval)

1. Validate staging smoke.
2. Point prod Studio `INDOBASE_DESIGN_URL` at the v2 host (or move Traefik for
   `design.indobase.in` to v2 and keep Penpot on a legacy subdomain).
3. Do **not** delete Penpot until users have exported any in-flight `.penpot` work (no import path).
