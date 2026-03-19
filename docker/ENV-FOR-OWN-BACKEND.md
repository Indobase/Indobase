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
