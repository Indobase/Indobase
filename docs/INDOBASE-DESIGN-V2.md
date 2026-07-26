# Indobase Design — engineering notes

Canonical docs: **[INDOBASE-DESIGN.md](./INDOBASE-DESIGN.md)**.

The Canva-class editor lives in `indobase-design-v2/`. Production hosts
`design.indobase.in` / `design.indobase.fun` (alias `studio-design.indobase.fun`)
on Vyom `.249`. The Penpot stack under `indobase-design/` is decommissioned —
do not deploy it.

## Image pin

```bash
DESIGN_VERSION=<git-sha> docker compose --env-file .env up -d --build
```

## Traefik

After recreate, refresh the file provider (container DNS):

```bash
bash /opt/indobase-design-v2/docker/scripts/refresh-traefik-route.sh
```
