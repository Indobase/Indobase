# Adral tenant (`adralproject-uspulzkzew`) — ops runbook

Project URL: `https://adralproject-uspulzkzew.indobase.in`

## Healthy check (REST + Auth must not be 502/503)

From any machine:

```bash
TENANT_HOST=adralproject-uspulzkzew.indobase.in ./docker/scripts/tenant-api-health-check.sh
```

Expected:

- **REST** → HTTP `200` or `401` (not `502`/`503`)
- **Auth** → HTTP `200` on `/auth/v1/health`

Optional: Storage `400` without auth header is normal; Functions root `400` with `missing function name` means runtime is up.

## Stack was down (502)

If all paths return **502**, the tenant compose stack is not running:

```bash
# On VPS
REF=adralproject-uspulzkzew
DIR=/var/lib/docker/volumes/indobase-backend-bmqhan_tenants-data/_data/$REF
cd "$DIR"
# Ensure DB role passwords match SAAS_DATA_PLANE_AUX_ROLE_PASSWORD (usually Indobase100)
docker compose up -d
```

Also verify Traefik dynamic config exists: `/etc/dokploy/traefik/dynamic/tenant-${REF}.yml`.

## Auth (staging site + Google OAuth)

| Setting | Value |
|--------|--------|
| **Site URL** | `https://staging.adral.ai` |
| **Redirect allow list** | `https://staging.adral.ai`, `https://adral.ai`, `https://adralproject-uspulzkzew.indobase.in` |
| **Google OAuth redirect URI** (Google Cloud Console) | `https://adralproject-uspulzkzew.indobase.in/auth/v1/callback` |

On the VPS, set control-plane `docker/.env` (Dokploy stack) **before** patching tenant auth:

```env
GOOGLE_ENABLED=true
GOOGLE_CLIENT_ID=<from Google Cloud Console>
GOOGLE_SECRET=<client secret>
```

Then add to tenant `docker-compose.yml` under `tenant-auth` `environment` (or re-provision from Studio after platform template includes Google vars):

```yaml
GOTRUE_EXTERNAL_GOOGLE_ENABLED: "true"
GOTRUE_EXTERNAL_GOOGLE_CLIENT_ID: "<client id>"
GOTRUE_EXTERNAL_GOOGLE_SECRET: "<secret>"
GOTRUE_EXTERNAL_GOOGLE_REDIRECT_URI: https://adralproject-uspulzkzew.indobase.in/auth/v1/callback
```

Restart auth: `docker compose up -d tenant-auth`.

Confirm: `curl -sS https://adralproject-uspulzkzew.indobase.in/auth/v1/settings | jq '.external.google'`

## Edge functions

1. Deploy function folders via **Studio → Edge Functions** (writes to `EDGE_FUNCTIONS_MANAGEMENT_FOLDER/<project_ref>/` on the Studio container).
2. Sync into the tenant runtime volume and restart:

```bash
PROJECT_REF=adralproject-uspulzkzew ./docker/scripts/sync-tenant-edge-functions-vps.sh
```

The runtime needs a `main/index.ts` router (seeded automatically by the provisioner or sync script).

## Secrets (edge runtime)

Studio’s Secrets API is metadata-only on SaaS; **runtime secrets** must be set on `tenant-functions` in compose `environment` (they are passed to Deno via `Deno.env`).

Copy keys from your app repo `supabase/functions/.env` (e.g. `OPENAI_API_KEY`, worker URLs) into the `tenant-functions` `environment` block, then:

```bash
cd "$DIR" && docker compose up -d tenant-functions
```

## Adral staging web app

**Deployed:** `https://adral-staging.indobase.in` (Swarm service `adral-staging` on `dokploy-network`).

Redeploy from the Adral repo:

```bash
INDO_REPO=/path/to/ind-repo npm run indobase:staging:deploy
```

Or: `ADRAL_REPO=/path/to/adral INDO_REPO=/path/to/ind-repo ./docker/scripts/deploy-adral-staging-vps.sh`

`config.js` is generated at container start from tenant anon key + `https://adralproject-uspulzkzew.indobase.in`.

Optional DNS: CNAME `staging.adral.ai` → VPS once you want the marketing hostname (Auth allow list already includes `staging.adral.ai`).

## Adral staging app env

Point the staging frontend at the **tenant host** (not `api.indobase.in`):

```env
NEXT_PUBLIC_SUPABASE_URL=https://adralproject-uspulzkzew.indobase.in
NEXT_PUBLIC_SUPABASE_ANON_KEY=<publishable anon key from Studio → Project Settings → API>
```

Use the project’s **Indobase-issued** anon JWT (`iss: indobase`, `project_ref: adralproject-uspulzkzew`), not legacy Supabase demo keys.

Smoke test (OAuth optional — email/password works without Google):

1. Open `https://adral-staging.indobase.in` — `config.js` must show the tenant URL (not empty).
2. Sign up / sign in with **email** (Google OAuth is optional; see Auth section above).
3. Send a chat message (`chat-completion` edge function + secrets must be deployed).
4. Optional: `curl` scheduled dispatch with `X-Schedule-Cron-Secret` → HTTP `200`.
