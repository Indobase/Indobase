# Env vars: dashboard image → your own backend

Use these when you run the **single dashboard image** (e.g. on Dokploy) and want it to talk to **your own** Postgres + Kong + postgres-meta (your backend).

Replace every value with the real hostnames/URLs and secrets your dashboard container can reach.  
If backend and dashboard are on the **same Docker network**, use service names (e.g. `db`, `meta`, `kong`).  
If they are on **different hosts**, use the hostname or URL the dashboard can use to reach each service.

---

## Required (copy into Dokploy / your orchestrator)

```env
# Postgres (Studio uses this for DB UI, lints, etc.)
POSTGRES_HOST=db
POSTGRES_PORT=5432
POSTGRES_DB=postgres
POSTGRES_PASSWORD=your-postgres-password

# postgres-meta API (Studio calls this for tables, SQL, migrations)
STUDIO_PG_META_URL=http://meta:8080

# Kong / API gateway
SUPABASE_URL=http://kong:8000
SUPABASE_PUBLIC_URL=https://your-api.example.com
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_KEY=your-service-role-key
AUTH_JWT_SECRET=your-jwt-secret-at-least-32-chars

# Used by Studio for some stored values
PG_META_CRYPTO_KEY=your-32-char-encryption-key
```

- **POSTGRES_HOST** – Hostname of your Postgres. Same network: `db`. Different host: e.g. `postgres.mybackend.com` or the internal IP.
- **STUDIO_PG_META_URL** – Full URL to postgres-meta. Same network: `http://meta:8080`. Else: `http://your-meta-host:8080`.
- **SUPABASE_URL** – URL Kong (or your API gateway) listens on **from the dashboard container**. Same network: `http://kong:8000`. Else: your Kong URL.
- **SUPABASE_PUBLIC_URL** – Public URL users/browsers use for the API (e.g. `https://api.yourdomain.com`).
- **SUPABASE_ANON_KEY**, **SUPABASE_SERVICE_KEY**, **AUTH_JWT_SECRET** – Same as in your backend (e.g. from the `.env` you use with `docker-compose`).
- **PG_META_CRYPTO_KEY** – Same as in your backend (e.g. from `.env`).

### One database per tenant (optional)

Studio can keep **control-plane** metadata in the Postgres denoted by **POSTGRES_**\* (`saas.organizations`, `saas.projects`, etc.) while each **project** uses its **own** Postgres for the SQL editor / schema UI:

- **POSTGRES_**\* should point at the DB where the `saas` schema lives (often a small shared admin database).
- Store the tenant’s Postgres URI via `PATCH /api/platform/projects/:ref` with **`tenant_database_url`** / **`connection_string`**.
  - New writes are stored **encrypted-at-rest** in **`saas.projects.connection_string_enc`**.
  - `saas.projects.connection_string` is legacy-only (lazy-migrated to encrypted on access).
- In **SaaS mode**, tenant DB routing is **fail-closed**: missing tenant URL does **not** fall back to **POSTGRES_***.
- Treat the control-plane database and any per-tenant URIs as secrets; restrict who can read `saas.projects`.

---

## Optional (nicer defaults + logs)

```env
DEFAULT_ORGANIZATION_NAME=Default Organization
DEFAULT_PROJECT_NAME=Default Project
OPENAI_API_KEY=sk-...
```

If you use Logflare/analytics and want logs in Studio:

```env
LOGFLARE_URL=http://analytics:4000
LOGFLARE_PRIVATE_ACCESS_TOKEN=your-logflare-private-token
NEXT_PUBLIC_ENABLE_LOGS=true
NEXT_ANALYTICS_BACKEND_PROVIDER=postgres
```

---

## Where to get the values

- If your backend is the **same** `docker-compose` from this repo: use the same values as in your backend `.env` (e.g. `POSTGRES_PASSWORD`, `ANON_KEY`, `SERVICE_ROLE_KEY`, `JWT_SECRET`, `PG_META_CRYPTO_KEY`).  
- **POSTGRES_HOST**, **STUDIO_PG_META_URL**, **SUPABASE_URL**: use the hostnames/URLs that the **dashboard container** can use to reach `db`, `meta`, and `kong`.  
  - Same Docker Compose network: `db`, `meta`, `kong`.  
  - Dokploy app and backend on same host: often the same service names or `host.docker.internal` (if supported).  
  - Different servers: your real hostnames or IPs and the correct ports.

---

## Checklist

1. Image running (e.g. `roshanraghavander/ind-repo:latest`), port **8080** exposed.
2. All required env vars set in Dokploy (or your runtime).
3. Dashboard container can reach Postgres, meta, and Kong (test with curl or from another container on the same network).
4. Open `https://your-dashboard-url/dashboard` and log in / use the project linked to that backend.

---

## Troubleshooting: 500 on `/api/platform/organizations` or `/api/platform/projects/...`

1. **`NEXT_PUBLIC_INDOBASE_SAAS` / public URLs** – Org and billing routes expect SaaS mode (default on). Public URLs are baked in at **build** time: rebuild the image if you change `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, or `NEXT_PUBLIC_GOTRUE_URL`.
2. **`STUDIO_PG_META_URL`** – Must be set to the postgres-meta base URL reachable from the Studio container (e.g. `http://meta:8080`).
3. **`PG_META_CRYPTO_KEY`** – Must match `CRYPTO_KEY` / `PG_META_CRYPTO_KEY` on the **meta** service so connection encryption matches.
4. **Postgres from Studio** – `POSTGRES_HOST`, `POSTGRES_PASSWORD`, etc. must point at the same DB meta uses; otherwise bootstrap of `saas.*` tables fails.

Open the failing response in DevTools → **Response** body; newer builds include clearer error messages for misconfiguration.

---

## Troubleshooting: Sign up / login fails with `Database error querying schema`

That string is returned by **GoTrue** when it cannot query Postgres (generic 500). Check Auth logs for the real cause.

**Control-plane disk full (production `.249`):** If `indobase-db` logs show `could not write lock file "postmaster.pid": No space left on device`, Docker DNS for hostname `db` fails and Auth returns this error. Free space (`docker image prune -af`, builder cache, journals), restart `indobase-db` / `indobase-auth` / `indobase-meta`, and ensure `/usr/local/bin/indobase-control-plane-disk-prune.sh` + `indobase-disk-prune.timer` are installed so unused Studio/Builder SHA images do not fill the disk again.

Other common causes: NULL token columns in `auth.users` (see below), broken Auth↔DB networking, or privilege/schema mismatches.

---

## Troubleshooting: Sign up fails with `Database error finding user`

That string is returned by **GoTrue** (your Auth service) when a query against `auth.users` fails. Studio only proxies the request to `/auth/v1/signup`; fixing it is always on the **database + Auth container** side.

1. **Read Auth logs** – Find the real Postgres error (the UI message is generic), e.g.  
   `docker logs <auth-container> 2>&1 | tail -n 80`  
   or your Dokploy service logs for `auth` / `gotrue`.

2. **`auth` schema must match your GoTrue version** – If the DB was created from ad-hoc SQL, restored from backup, or only partly migrated, tables/columns may not match what Auth expects. Use the **same migration set** as your Supabase/Auth Docker images, or re-init the DB from the official compose flow in dev.

3. **NULL token columns** – GoTrue can fail when token columns are `NULL` but scanned as non-null strings. As a superuser (e.g. `postgres`), in the **same** database Auth uses (`GOTRUE_DB_DATABASE_URL`):

   ```sql
   UPDATE auth.users SET confirmation_token = '' WHERE confirmation_token IS NULL;
   UPDATE auth.users SET recovery_token = '' WHERE recovery_token IS NULL;
   UPDATE auth.users SET email_change_token_new = '' WHERE email_change_token_new IS NULL;
   UPDATE auth.users SET email_change_token_current = '' WHERE email_change_token_current IS NULL;
   UPDATE auth.users SET reauthentication_token = '' WHERE reauthentication_token IS NULL;
   ```

4. **Triggers on `auth.users`** – A trigger that runs on insert/update (e.g. copying into `public.profiles`) can fail and surface as an Auth error. Temporarily disable to confirm, then fix the function (e.g. `SECURITY DEFINER`, valid `search_path`, no missing tables).

5. **Roles / grants** – `supabase_auth_admin` must retain intended privileges on `auth.*`. Tools that rewrite the `auth` schema (e.g. some Prisma workflows) can break Auth; restore grants per [Supabase + Prisma docs](https://supabase.com/docs/guides/database/prisma) if applicable.

6. **Auth must point at the right Postgres** – In compose, `GOTRUE_DB_DATABASE_URL` should match the same `POSTGRES_*` database where `auth` migrations were applied. Wrong host DB → empty or wrong schema → “finding user” errors.
