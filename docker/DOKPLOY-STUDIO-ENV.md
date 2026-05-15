# Studio environment (Dokploy / Compose)

Map your **backend** `.env` onto the **studio** service. Missing or mangled vars cause **502** on `/api/platform/profile*` after sign-in.

## Critical: quote `PG_META_CRYPTO_KEY`

If the value contains `+` or `=`, **always quote it** in `.env` or Dokploy UI. Unquoted `+` is often read as a space → Studio and meta decrypt differently → postgres-meta returns **Unauthorized**.

```env
PG_META_CRYPTO_KEY="your-key-with-plus-signs="
CRYPTO_KEY="your-key-with-plus-signs="
```

`PG_META_CRYPTO_KEY` on **studio** must equal `CRYPTO_KEY` on **meta** (byte-for-byte).

## Split deploy: Compose backend + separate Studio Application

If Studio is a **separate Dokploy Application** (your setup), it cannot resolve `indobase-meta` until it shares the Compose Docker network.

**VPS fix (installed via `docker/scripts/indobase-studio-attach-compose-network.sh` + systemd timer):** every 2 minutes (and on boot) the Studio task is connected to `indobase-backend-bmqhan_default`. After a Dokploy redeploy, wait up to 2 minutes or run:

```bash
sudo /usr/local/bin/indobase-studio-attach-compose-network.sh
```

Automate via CI (alternative — host-published meta port):

1. Compose publishes meta on the host (`PG_META_PUBLISH_PORT=8081` in `docker-compose.yml`).
2. GitHub Actions runs `docker/scripts/dokploy-studio-split-env.sh` when these secrets exist:
   - `DOKPLOY_API_URL`, `DOKPLOY_API_KEY`, `DOKPLOY_APPLICATION_ID`, `DOKPLOY_COMPOSE_ID`
3. Script sets on the Studio app:
   - `STUDIO_PG_META_URL=http://172.17.0.1:8081` (override gateway with secret `DOCKER_GATEWAY_IP` if needed)
   - `SUPABASE_URL=https://api.indobase.in` (public — not `indobase-kong`)

One-time: add secrets, redeploy Compose once (to expose port 8081), push to `main`. Or run locally:

```bash
export DOKPLOY_API_URL=… DOKPLOY_API_KEY=… DOKPLOY_APPLICATION_ID=…
./docker/scripts/dokploy-studio-split-env.sh
```

Firewall: block public access to port **8081** on the VPS (`ufw deny 8081` or cloud security group).

## `STUDIO_PG_META_URL`

| Your setup | Use |
|------------|-----|
| Studio + meta in same Compose stack | `http://meta:8080` or `http://indobase-meta:8080` |
| Studio separate Application (split) | `http://172.17.0.1:8081` after compose publishes meta (see above) |
| Studio cannot resolve `meta` | Join Compose network, or use split host port |

Do **not** use:

- `https://api.indobase.in` (public Kong)
- `http://indobase-kong:8000/pg` (Kong has no postgres-meta route — causes **Unauthorized** / 502)

Use the **meta** service on port **8080** only.

## Studio service — minimum env block

Paste into Dokploy → **studio** service environment (adjust hostnames to match your Compose service names):

```env
# Image (from CI)
STUDIO_DOCKER_IMAGE=roshanraghavander/ind-repo:latest

# Postgres (control plane — same DB as meta)
POSTGRES_HOST=db
POSTGRES_PORT=5432
POSTGRES_DB=postgres
POSTGRES_PASSWORD=your-postgres-password
POSTGRES_USER_READ_WRITE=supabase_admin
POSTGRES_USER_READ_ONLY=supabase_read_only_user

# postgres-meta (quoted if value contains +)
PG_META_CRYPTO_KEY="your-pg-meta-crypto-key"
STUDIO_PG_META_URL=http://meta:8080

# Auth / API (internal Docker URLs)
JWT_SECRET=your-jwt-secret
AUTH_JWT_SECRET=your-jwt-secret
SUPABASE_URL=http://kong:8000
SUPABASE_PUBLIC_URL=https://api.indobase.in
SUPABASE_ANON_KEY=your-anon-jwt
SUPABASE_SERVICE_KEY=your-service-role-jwt
GOTRUE_URL=http://kong:8000/auth/v1
KONG_INTERNAL_GOTRUE_URL=http://kong:8000/auth/v1

# SaaS
NEXT_PUBLIC_INDOBASE_SAAS=true
SAAS_DEDICATED_DATABASE_ON_PROJECT_CREATE=true

# Logs (optional)
LOGFLARE_URL=http://analytics:4000
LOGFLARE_PUBLIC_ACCESS_TOKEN=your-token
LOGFLARE_PRIVATE_ACCESS_TOKEN=your-token
NEXT_PUBLIC_ENABLE_LOGS=true
NEXT_ANALYTICS_BACKEND_PROVIDER=postgres

DATA_PLANE_PROVISIONER_URL=http://data-plane-provisioner:8787
DATA_PLANE_PROVISIONER_TOKEN=your-token

STUDIO_DEFAULT_ORGANIZATION=Default Organization
STUDIO_DEFAULT_PROJECT=Default Project
```

Replace `kong` / `meta` / `db` / `analytics` with `indobase-kong`, `indobase-meta`, `indobase-db`, etc. if your Compose file uses those service names.

## Studio cannot reach meta (toast: `fetch failed`)

If `/api/health` returns 500 or `saasInfra` says `Cannot reach postgres-meta`, the **Studio container is not on the same Docker network** as `indobase-meta`, or `STUDIO_PG_META_URL` is wrong.

**Fix (pick one):**

1. Deploy Studio **inside the same Compose stack** as `meta`, `db`, and `kong` (recommended).
2. In Dokploy, attach the Studio application to the **same network** as the Compose project.
3. Expose meta on the host and set `STUDIO_PG_META_URL=http://host.docker.internal:<meta-port>` (last resort).

Test from inside the Studio container:

```bash
wget -qO- http://indobase-meta:8080/health || curl -sS http://indobase-meta:8080/health
```

## Verify after restart (meta, then studio)

```bash
curl -sS https://studio.indobase.in/api/health | jq '.checks.saasInfra'
```

Expected: `"status": "ok"`. If still `Unauthorized`, re-check quoted crypto keys on **both** studio and meta.

## JWT / anon key

`ANON_KEY` and `SERVICE_ROLE_KEY` must be signed with the same `JWT_SECRET` as GoTrue. If you changed `JWT_SECRET` but kept demo anon/service JWTs, regenerate keys with `docker/utils/generate-keys.sh` and update Kong + Studio env.
