# Dokploy: auto-deploy Studio image from GitHub Actions

## Automatic deploy after every change

**Deploy only runs when code reaches GitHub:** merge or push to **`main`** (or **`master`**). That triggers [`docker-publish.yml`](../.github/workflows/docker-publish.yml): build → push image → Dokploy deploy (API / webhook) → optional prod smoke check.

Local edits are **not** deployed until they are **committed and pushed** to `main`.

To actually roll out new containers on each push, configure **one** of these in GitHub → **Settings → Secrets and variables → Actions**:

| Goal | Secrets |
|------|---------|
| **PostHog analytics (baked into Studio image at build)** | `POSTHOG_PROJECT_KEY` — project token from PostHog → Settings → Project (`phc_…`) |
| **Studio as Dokploy Application** (recommended for split deploy) | `DOKPLOY_API_URL`, `DOKPLOY_API_KEY`, `DOKPLOY_APPLICATION_ID` |
| **Full stack as Dokploy Compose** | Same plus `DOKPLOY_COMPOSE_ID` (optional **instead of** relying on Git webhook for Compose) |
| **Git / generic deploy webhook** | `DOKPLOY_DEPLOY_WEBHOOK` |

Without these, CI still builds and pushes Docker Hub; Dokploy steps are skipped or webhook-only (see warnings in the Actions log).

---

CI pushes `roshanraghavander/ind-repo:latest` and `roshanraghavander/ind-repo:<commit-sha>` on every push to `main`, then calls your Dokploy deploy webhook and polls `https://studio.indobase.in/api/health/live` until `version` matches the commit. Full readiness (postgres-meta, GoTrue) is `GET /api/health` (may return 503 while env/network is wrong).

If the GitHub Actions **deploy** job shows warnings, the image is on Docker Hub but **Dokploy did not run a new container with that image**. The **build** job still passes; fix Dokploy and redeploy manually.

### `{"message":"Branch Not Match"}` (HTTP 301) from the deploy webhook

The `DOKPLOY_DEPLOY_WEBHOOK` secret is a **Git-provider** webhook. Dokploy only accepts it when the push **ref** matches the branch configured on the app (usually `main`).

1. In Dokploy → Studio app → **General**, set the Git branch to **`main`** (same as GitHub default branch).
2. CI now sends a GitHub-style payload with `"ref": "refs/heads/main"`. If it still fails, the app may be **Docker-image** based — use one of:
   - **Docker Hub webhook:** Docker Hub → `roshanraghavander/ind-repo` → Webhooks → paste the same Dokploy deploy URL; tag must be **`latest`** in Dokploy.
   - **Dokploy API:** set GitHub secrets `DOKPLOY_API_URL`, `DOKPLOY_API_KEY`, `DOKPLOY_APPLICATION_ID` (see `.github/workflows/docker-publish.yml`).
3. For **Docker Compose** in Dokploy (not Git): webhook may not apply — click **Deploy** manually after each CI run, or switch Studio to an **Application** service pulling `roshanraghavander/ind-repo:latest`.

### `{"message":"Error deploying Compose"}` (HTTP 400)

The Git webhook triggers a **full stack** `docker compose up` in Dokploy. That often fails when:

1. **Missing env in Dokploy** — copy variables from `docker/.env.example` into the Compose service env (at minimum `POSTGRES_PASSWORD`, `JWT_SECRET`, `ANON_KEY`, `SERVICE_ROLE_KEY`, `PG_META_CRYPTO_KEY`, `SUPABASE_PUBLIC_URL`).
2. **`STUDIO_DOCKER_IMAGE`** — set `STUDIO_DOCKER_IMAGE=roshanraghavander/ind-repo:latest` in Dokploy (defaults to that in `docker-compose.yml` if unset).
3. **Backend services down** — `studio` depends on `db`, `kong`, `meta`, `analytics`, etc. Open Dokploy → Compose → **Logs** for the failing service.
4. **Prefer API over Git webhook for Compose** — add GitHub secrets:
   - `DOKPLOY_API_URL` — your Dokploy panel URL (e.g. `https://dokploy.example.com`)
   - `DOKPLOY_API_KEY` — Profile → API/CLI
   - `DOKPLOY_COMPOSE_ID` — from `GET /api/project.all` → your compose stack `composeId`  
   CI will call `POST /api/compose.deploy` instead of relying on the Git webhook.

See **[DOKPLOY-STUDIO-ENV.md](./DOKPLOY-STUDIO-ENV.md)** for a full studio env block mapped from your backend `.env`.

### Sign-in works but `/organizations` shows 502 / "Unexpected token &lt;!DOCTYPE"

`/api/health` reports `saasInfra: postgres-meta query failed: Unauthorized`. Platform APIs (`/api/platform/profile`, `/permissions`, `/notifications`) return **502** until this is fixed.

1. In Dokploy → **Compose** (or Studio service) **Environment**, set the **same** `PG_META_CRYPTO_KEY` on **both** `studio` and `meta` (meta uses it as `CRYPTO_KEY` in `docker-compose.yml`).
2. Copy the value from your server `docker/.env` — do not invent a new key; if keys diverged, pick one value, set it on both services, then **restart meta and studio**.
3. Confirm `STUDIO_PG_META_URL=http://indobase-meta:8080` (Docker network hostname, not `https://api.indobase.in`).
4. Confirm `POSTGRES_PASSWORD`, `POSTGRES_HOST`, `POSTGRES_DB` match the running `db` service.
5. After restart: `curl -sS https://studio.indobase.in/api/health` → `checks.saasInfra.status` should be `"ok"`.

## Checklist (fix in Dokploy UI)

1. **Image tag must be `latest` (recommended)**  
   - **Application** deploy: Docker image = `roshanraghavander/ind-repo:latest`  
   - **Docker Compose** deploy: env `STUDIO_DOCKER_IMAGE=roshanraghavander/ind-repo:latest`  
   Do **not** pin `roshanraghavander/ind-repo:36584687…` or another old SHA unless you update it on every release.

2. **Deploy webhook**  
   - Studio app → **Deployments** → copy **Deploy Webhook** URL  
   - GitHub repo → **Settings → Secrets → Actions** → `DOKPLOY_DEPLOY_WEBHOOK` = that URL  
   - After each push to `main`, open Dokploy **Deployments** and confirm a new deploy started (not only "success" in GitHub).

3. **Pull fresh image on deploy**  
   - Compose: `pull_policy: always` on the `studio` service (see `docker/docker-compose.yml`).  
   - Application: enable pull / disable "use local image" if Dokploy exposes that option.

4. **Manual recovery**  
   - Dokploy → Studio → **Deploy** (or Restart)  
   - Then verify: `curl -sS https://studio.indobase.in/api/health | jq .version`  
     should equal the latest `main` commit SHA from GitHub.

## Optional: Docker Hub → Dokploy webhook

For **Application** (not Compose) deploys, you can add a Docker Hub webhook (repository → Webhooks) pointing at the same Dokploy deploy URL. Dokploy only redeploys when the **tag matches** the tag configured on the application (`latest`).

## Optional: Dokploy API (CI)

**Docker Compose stack (recommended for your setup):**

| Secret | Value |
|--------|--------|
| `DOKPLOY_API_URL` | Dokploy panel origin, e.g. `https://dokploy.indobase.in` |
| `DOKPLOY_API_KEY` | Profile → API/CLI |
| `DOKPLOY_COMPOSE_ID` | `composeId` from `GET /api/project.all` |

**Standalone Application (Docker image only, not full compose):**

| Secret | Value |
|--------|--------|
| `DOKPLOY_APPLICATION_ID` | `applicationId` from `GET /api/project.all` |

See `.github/workflows/docker-publish.yml` deploy job.

## Platform admin, metering, and sign-off

Operator allowlisting, `saas.usage_events` / Vector, and a short production checklist are documented in **[PLATFORM-ADMIN-OPS.md](./PLATFORM-ADMIN-OPS.md)**.

## Project deployment executor

Indobase Hosting deployment requests are drained by a VPS-side worker, not by in-process Next.js timers. The production path is:

1. Studio queues a deployment in `saas.project_deployments`.
2. The VPS worker calls `POST /api/platform/deployments/process` with `x-indobase-deployment-token`.
3. Studio claims work, probes the target URL, updates logs/status, and recovers stale `building` leases.

Install on the VPS:

```bash
sudo bash /etc/dokploy/compose/indobase-backend-bmqhan/code/docker/scripts/install-project-deployment-executor.sh
```

Set `/etc/indobase/project-deployment-executor.env` with:

```env
PROJECT_DEPLOYMENT_EXECUTOR_URL=https://studio.indobase.in
PROJECT_DEPLOYMENT_RUNTIME_SECRET=your-32-character-or-longer-runtime-secret
PROJECT_DEPLOYMENT_EXECUTOR_WORKER_ID=vps-project-deployment-executor
PROJECT_DEPLOYMENT_EXECUTOR_LIMIT=5
```

Verify:

```bash
sudo systemctl status indobase-project-deployment-executor.service
sudo journalctl -u indobase-project-deployment-executor.service -n 100 --no-pager
curl -sS https://studio.indobase.in/api/health/live | jq .
```

For a one-shot cron-style run instead of a daemon:

```bash
PROJECT_DEPLOYMENT_EXECUTOR_ENV_FILE=/etc/indobase/project-deployment-executor.env \
  /etc/dokploy/compose/indobase-backend-bmqhan/code/docker/scripts/project-deployment-executor.sh --once
```

## Project mobile build executor

Android bundle build requests are drained by a VPS-side worker, not by in-process Next.js timers. The production path is:

1. Studio queues a build in `saas.project_mobile_builds`.
2. The VPS worker calls `POST /api/platform/mobile-builds/process` with `x-indobase-mobile-build-token`.
3. Studio claims work and marks the build `building`.
4. The worker runs `PROJECT_MOBILE_BUILD_EXECUTOR_COMMAND`, sends heartbeats, and PATCHes final status/artifacts back to Studio.

Install on the VPS:

```bash
sudo bash /etc/dokploy/compose/indobase-backend-bmqhan/code/docker/scripts/install-project-mobile-build-executor.sh
```

Set `/etc/indobase/project-mobile-build-executor.env` with:

```env
PROJECT_MOBILE_BUILD_EXECUTOR_URL=https://studio.indobase.in
PROJECT_MOBILE_BUILD_RUNTIME_SECRET=your-32-character-or-longer-runtime-secret
PROJECT_MOBILE_BUILD_EXECUTOR_WORKER_ID=vps-project-mobile-build-executor
PROJECT_MOBILE_BUILD_EXECUTOR_COMMAND=/opt/indobase/build-android-aab.sh
```

The configured command receives these environment variables:

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

The command should write `INDOBASE_MOBILE_BUILD_RESULT_FILE` as JSON:

```json
{
  "status": "ready",
  "log_message": "Android bundle built successfully",
  "metadata_patch": {
    "executor_result": {
      "builder": "eas"
    }
  },
  "artifacts": [
    {
      "kind": "android_aab",
      "file_name": "app-release.aab",
      "download_url": "https://artifacts.indobase.in/builds/app-release.aab",
      "size_bytes": 12345678,
      "checksum_sha256": "..."
    }
  ]
}
```

Queue fairness and concurrency are enforced in Studio before workers claim jobs:

- Only one active build per project may exist at a time.
- Organization-level concurrency is tier aware by default:
  - `free`: `1` building, `3` outstanding
  - `pro`: `3` building, `10` outstanding
  - `team`: `10` building, `25` outstanding
  - `enterprise`: `25` building, `100` outstanding
  - `platform`: `50` building, `200` outstanding
- `team`, `enterprise`, and `platform` default to the priority queue lane.

Override defaults without redeploying Studio:

```env
PROJECT_MOBILE_BUILD_FREE_MAX_CONCURRENT_PER_ORG=1
PROJECT_MOBILE_BUILD_PRO_MAX_CONCURRENT_PER_ORG=4
PROJECT_MOBILE_BUILD_TEAM_MAX_CONCURRENT_PER_ORG=12
PROJECT_MOBILE_BUILD_ENTERPRISE_MAX_CONCURRENT_PER_ORG=30
PROJECT_MOBILE_BUILD_PLATFORM_MAX_CONCURRENT_PER_ORG=60

PROJECT_MOBILE_BUILD_FREE_MAX_OUTSTANDING_PER_ORG=3
PROJECT_MOBILE_BUILD_PRO_MAX_OUTSTANDING_PER_ORG=12
PROJECT_MOBILE_BUILD_TEAM_MAX_OUTSTANDING_PER_ORG=40
PROJECT_MOBILE_BUILD_ENTERPRISE_MAX_OUTSTANDING_PER_ORG=120
PROJECT_MOBILE_BUILD_PLATFORM_MAX_OUTSTANDING_PER_ORG=250

PROJECT_MOBILE_BUILD_FREE_PRIORITY=standard
PROJECT_MOBILE_BUILD_PRO_PRIORITY=standard
PROJECT_MOBILE_BUILD_TEAM_PRIORITY=priority
PROJECT_MOBILE_BUILD_ENTERPRISE_PRIORITY=priority
PROJECT_MOBILE_BUILD_PLATFORM_PRIORITY=priority
```

For 100+ concurrent users, run a worker fleet instead of one VPS daemon:

1. Keep Studio as the queue/control plane only.
2. Run multiple `indobase-project-mobile-build-executor.service` instances across a pool of build hosts.
3. Give each worker one build slot and let Studio distribute work through the queue.
4. Autoscale the fleet from queue depth, for example add workers when `requested` builds exceed available slots.
5. Split pools by plan if needed, such as standard workers for `free/pro` and priority workers for `team+`.

Verify:

```bash
sudo systemctl status indobase-project-mobile-build-executor.service
sudo journalctl -u indobase-project-mobile-build-executor.service -n 100 --no-pager
curl -sS https://studio.indobase.in/api/health/live | jq .
```

For a one-shot run instead of a daemon:

```bash
PROJECT_MOBILE_BUILD_EXECUTOR_ENV_FILE=/etc/indobase/project-mobile-build-executor.env \
  /etc/dokploy/compose/indobase-backend-bmqhan/code/docker/scripts/project-mobile-build-executor.sh --once
```
