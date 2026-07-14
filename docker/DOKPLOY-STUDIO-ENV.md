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
| Studio separate Application (split) | `http://indobase-meta:8080` after `indobase-studio-attach-compose-network.sh` (preferred). Host gateway `http://172.17.0.1:8081` often **times out** from Swarm overlay networks — avoid unless meta is unreachable by hostname. |
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
POSTGRES_USER=postgres
POSTGRES_PASSWORD=your-postgres-password
# Role used by postgres-meta / Studio for SQL — must match whoever owns POSTGRES_PASSWORD (defaults to POSTGRES_USER).
POSTGRES_USER_READ_WRITE=postgres
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

# SaaS — dedicated tenant DB required (secure by default)
NEXT_PUBLIC_INDOBASE_SAAS=true
SAAS_DEDICATED_DATABASE_ON_PROJECT_CREATE=true
# Never set to true in production with untrusted tenants (cross-tenant auth/storage leak).
SAAS_ALLOW_SHARED_DATABASE_TENANCY=false

# Logs (self-hosted Logflare in compose — do NOT use logflare.app cloud)
# Run on VPS after tokens exist: bash docker/scripts/sync-logflare-env-to-studio.sh
# Base URL only — do NOT use cloud ingestion URLs like api.logflare.app/api/logs?source=...
LOGFLARE_URL=http://indobase-analytics:4000
LOGFLARE_PUBLIC_ACCESS_TOKEN=your-token
LOGFLARE_PRIVATE_ACCESS_TOKEN=your-token
NEXT_PUBLIC_ENABLE_LOGS=true
NEXT_ANALYTICS_BACKEND_PROVIDER=postgres

# Vercel integration (server-side secrets; register app at vercel.com/integrations)
VERCEL_CLIENT_ID=your_vercel_client_id
VERCEL_CLIENT_SECRET=your_vercel_client_secret
NEXT_PUBLIC_VERCEL_INTEGRATION_URL=https://vercel.com/integrations/your-indobase-slug

# GitHub integration (server-side; OAuth app callback https://studio.indobase.in/integrations/github/authorize)
GITHUB_INTEGRATION_CLIENT_ID=your_github_client_id
GITHUB_INTEGRATION_CLIENT_SECRET=your_github_client_secret

# Razorpay billing (INR; see RAZORPAY_BILLING_SETUP.md)
RAZORPAY_KEY_ID=rzp_test_xxxx
RAZORPAY_KEY_SECRET=xxxx
RAZORPAY_WEBHOOK_SECRET=xxxx
NEXT_PUBLIC_RAZORPAY_BILLING=true
NEXT_PUBLIC_RAZORPAY_KEY_ID=rzp_test_xxxx
# Optional pre-created plan IDs:
# RAZORPAY_PLAN_ID_PRO=plan_xxxx
# RAZORPAY_PLAN_ID_TEAM=plan_xxxx

DATA_PLANE_PROVISIONER_URL=http://data-plane-provisioner:8787
DATA_PLANE_PROVISIONER_TOKEN=your-token
# Studio cron APIs (/api/cron/quota-enforce, /api/cron/usage-collect). May match provisioner token.
INDOBASE_CRON_SECRET=your-token
# Compose stack: pin provisioner image (CI publishes roshanraghavander/ind-repo-provisioner:<sha>)
# DATA_PLANE_PROVISIONER_IMAGE=roshanraghavander/ind-repo-provisioner:latest

# Project deployment executor auth and health probes.
# Prefer a dedicated secret for VPS workers that call /api/platform/deployments/process and
# /api/platform/projects/:ref/deployments/:deploymentId. Falls back to BUILDER_HANDOFF_SECRET or
# AUTH_JWT_SECRET/JWT_SECRET only when this is unset.
PROJECT_DEPLOYMENT_RUNTIME_SECRET=your-32-character-or-longer-runtime-secret
# Optional executor tuning.
# PROJECT_DEPLOYMENT_PROBE_TIMEOUT_MS=12000
# PROJECT_DEPLOYMENT_STALE_AFTER_MS=900000

# Platform admin delete: when unset or any value other than "false", deleting a project/org as a
# platform operator runs infrastructure teardown (provisioner POST /teardown + dedicated tenant DB drop).
# Set to "false" to only remove control-plane rows (legacy behavior).
# PLATFORM_ADMIN_PROJECT_DELETE_TEARDOWN=false

# SQL Editor / AI assistant (optional; without this, AI features return a clear configuration error)
OPENAI_API_KEY=sk-...

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

## "password authentication failed for user supabase_admin" when creating a project

postgres-meta runs Studio’s SaaS SQL using **`POSTGRES_USER_READ_WRITE`** together with **`POSTGRES_PASSWORD`**. If those pointed at **`supabase_admin`** while your password is only valid for the **`postgres`** superuser (typical Docker `POSTGRES_USER`), Postgres rejects the connection.

**Fix:** Set **`POSTGRES_USER=postgres`** (or whatever your DB container uses) and **`POSTGRES_USER_READ_WRITE=postgres`**, or remove `POSTGRES_USER_READ_WRITE` so Studio defaults it from `POSTGRES_USER`. Only use `supabase_admin` here if that role exists **and** its password matches `POSTGRES_PASSWORD`.

## JWT / anon key

`ANON_KEY` and `SERVICE_ROLE_KEY` must be signed with the same `JWT_SECRET` as GoTrue. If you changed `JWT_SECRET` but kept demo anon/service JWTs, regenerate keys with `docker/utils/generate-keys.sh` and update Kong + Studio env.

## Platform admin (`/platform-admin`)

Cross-tenant operator dashboard (organizations, projects, users, audit logs). Access is **not** org RBAC — allowlist server env only:

```env
# Comma-separated GoTrue user UUIDs and/or sign-in emails
PLATFORM_OPERATOR_GOTRUE_IDS=
PLATFORM_OPERATOR_EMAILS=you@example.com
```

After setting on the Studio service, redeploy. Operators see **Platform admin** in the user menu (avatar) and can open `https://studio.indobase.in/platform-admin`.

## Project deployment executor on the VPS

Queued Indobase Hosting deployments are processed by a small VPS-side worker that calls the Studio runtime endpoints. Install it after Studio env is set:

```bash
sudo bash /etc/dokploy/compose/indobase-backend-bmqhan/code/docker/scripts/install-project-deployment-executor.sh
```

The installer creates `/etc/indobase/project-deployment-executor.env`. Set at minimum:

```env
PROJECT_DEPLOYMENT_EXECUTOR_URL=https://studio.indobase.in
PROJECT_DEPLOYMENT_RUNTIME_SECRET=your-32-character-or-longer-runtime-secret
PROJECT_DEPLOYMENT_EXECUTOR_WORKER_ID=vps-project-deployment-executor
```

Useful commands:

```bash
sudo systemctl status indobase-project-deployment-executor.service
sudo journalctl -u indobase-project-deployment-executor.service -f
sudo /etc/dokploy/compose/indobase-backend-bmqhan/code/docker/scripts/project-deployment-executor.sh --once
```

The worker runs continuously, claims batches from `/api/platform/deployments/process`, and preserves lease ownership with the `worker_id` stored on each deployment.

## Android mobile build executor

Install the companion worker:

```bash
sudo bash /etc/dokploy/compose/indobase-backend-bmqhan/code/docker/scripts/install-project-mobile-build-executor.sh
```

The installer creates `/etc/indobase/project-mobile-build-executor.env`. Set at minimum:

```env
PROJECT_MOBILE_BUILD_EXECUTOR_URL=https://studio.indobase.in
PROJECT_MOBILE_BUILD_RUNTIME_SECRET=your-32-character-or-longer-runtime-secret
PROJECT_MOBILE_BUILD_EXECUTOR_WORKER_ID=vps-project-mobile-build-executor
PROJECT_MOBILE_BUILD_EXECUTOR_COMMAND=/opt/indobase/build-android-aab.sh
```

Useful commands:

```bash
sudo systemctl status indobase-project-mobile-build-executor.service
sudo journalctl -u indobase-project-mobile-build-executor.service -f
sudo /etc/dokploy/compose/indobase-backend-bmqhan/code/docker/scripts/project-mobile-build-executor.sh --once
```

The worker claims jobs from `/api/platform/mobile-builds/process`, keeps the lease alive with `worker_id`, runs `PROJECT_MOBILE_BUILD_EXECUTOR_COMMAND`, and PATCHes the final status plus artifact metadata back to Studio.

Studio also enforces tier-aware queue limits before workers claim builds:

```env
PROJECT_MOBILE_BUILD_FREE_MAX_CONCURRENT_PER_ORG=1
PROJECT_MOBILE_BUILD_PRO_MAX_CONCURRENT_PER_ORG=3
PROJECT_MOBILE_BUILD_TEAM_MAX_CONCURRENT_PER_ORG=10
PROJECT_MOBILE_BUILD_ENTERPRISE_MAX_CONCURRENT_PER_ORG=25
PROJECT_MOBILE_BUILD_PLATFORM_MAX_CONCURRENT_PER_ORG=50

PROJECT_MOBILE_BUILD_FREE_MAX_OUTSTANDING_PER_ORG=3
PROJECT_MOBILE_BUILD_PRO_MAX_OUTSTANDING_PER_ORG=10
PROJECT_MOBILE_BUILD_TEAM_MAX_OUTSTANDING_PER_ORG=25
PROJECT_MOBILE_BUILD_ENTERPRISE_MAX_OUTSTANDING_PER_ORG=100
PROJECT_MOBILE_BUILD_PLATFORM_MAX_OUTSTANDING_PER_ORG=200

PROJECT_MOBILE_BUILD_FREE_PRIORITY=standard
PROJECT_MOBILE_BUILD_PRO_PRIORITY=standard
PROJECT_MOBILE_BUILD_TEAM_PRIORITY=priority
PROJECT_MOBILE_BUILD_ENTERPRISE_PRIORITY=priority
PROJECT_MOBILE_BUILD_PLATFORM_PRIORITY=priority
```

Recommended high-concurrency rollout:

1. Keep one build slot per worker.
2. Scale worker count horizontally based on queue depth.
3. Reserve a priority worker pool for `team`, `enterprise`, and `platform` traffic if needed.
4. Use separate artifact storage/CDN from Studio so build downloads do not compete with control-plane traffic.

Your build command receives:

```env
INDOBASE_MOBILE_BUILD_JSON_FILE=/tmp/claimed-build.json
INDOBASE_MOBILE_BUILD_RESULT_FILE=/tmp/build-result.json
INDOBASE_MOBILE_BUILD_LOG_FILE=/tmp/build-command.log
INDOBASE_MOBILE_BUILD_ID=<build-id>
INDOBASE_MOBILE_BUILD_PROJECT_REF=<project-ref>
INDOBASE_MOBILE_BUILD_WORKER_ID=<worker-id>
INDOBASE_MOBILE_BUILD_API_BASE=https://studio.indobase.in
INDOBASE_MOBILE_BUILD_RUNTIME_TOKEN=<runtime-secret>
```

Write `INDOBASE_MOBILE_BUILD_RESULT_FILE` as JSON to publish artifacts back into Studio:

```json
{
  "status": "ready",
  "log_message": "Android bundle built successfully",
  "artifacts": [
    {
      "kind": "android_aab",
      "file_name": "app-release.aab",
      "download_url": "https://artifacts.indobase.in/builds/app-release.aab"
    }
  ]
}
```
