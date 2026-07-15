# Deploy the dashboard image (step-by-step)

Run the **single Node image** (marketing at `/` + Studio at `/dashboard`) and point it at your **Indobase BaaS stack** (Postgres, Kong, postgres-meta, GoTrue, etc.).

There is **no** “cloud platform API only” mode: the dashboard always uses your **control plane** (`/api` on the same app) plus **postgres-meta** and Postgres for org/project metadata.

---

## 1. Have the image

- **From GitHub Actions:** Push to `main` / `master` and use the “Build and Push Docker Image” workflow (see `.github/workflows/docker-publish.yml`).
- **Or build locally:** From repo root run `./docker-build.sh` (then tag and push if needed).

---

## 2. Run the container

```bash
docker run -d \
  --name indobase-dashboard \
  -p 8080:8080 \
  roshanraghavander/ind-repo:latest
```

- **http://localhost:8080** → marketing site  
- **http://localhost:8080/dashboard** → Studio  

---

## 3. Wire the backend (required)

Set environment variables so Studio can reach **Postgres**, **postgres-meta**, and **Kong** (same values as in your full stack `.env` where applicable). See **[ENV-FOR-OWN-BACKEND.md](./ENV-FOR-OWN-BACKEND.md)** for the full list and troubleshooting.

Minimal example (same Docker network as `db`, `meta`, `kong`):

```bash
docker run -d \
  --name indobase-dashboard \
  -p 8080:8080 \
  -e POSTGRES_HOST=db \
  -e POSTGRES_PORT=5432 \
  -e POSTGRES_DB=postgres \
  -e POSTGRES_PASSWORD=your-password \
  -e STUDIO_PG_META_URL=http://meta:8080 \
  -e PG_META_CRYPTO_KEY=your-32-char-key-matching-meta \
  -e SUPABASE_URL=http://kong:8000 \
  -e SUPABASE_ANON_KEY=your-anon-jwt \
  -e SUPABASE_SERVICE_KEY=your-service-role-jwt \
  -e AUTH_JWT_SECRET=your-jwt-secret \
  roshanraghavander/ind-repo:latest
```

**Build-time URLs** (`NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_GOTRUE_URL`, `NEXT_PUBLIC_INDOBASE_SAAS`, etc.) are baked into the Next.js client at **image build** time. To change them, rebuild the image with different `ARG`/`ENV` in the Dockerfile or CI build-args (see `.github/workflows/docker-publish.yml`).

---

## 4. Dokploy / Railway / k8s

1. Use your registry image; expose container port **8080**.
2. Set the variables from **ENV-FOR-OWN-BACKEND.md** (and any `NEXT_PUBLIC_*` you override at build time).
3. Ensure the dashboard container can reach Postgres, meta, and Kong (DNS / network / firewall).

**Dokploy deploy from GitHub Actions (manual only):** see **[DOKPLOY-STUDIO-DEPLOY.md](./DOKPLOY-STUDIO-DEPLOY.md)** if images are on Docker Hub but `studio.indobase.in/api/health` `version` stays on an old commit — push does not deploy; enable **deploy** on a workflow_dispatch run or click Deploy in Dokploy.

---

## 5. Quick checklist

- [ ] Image runs; `:8080` and `:8080/dashboard` load.
- [ ] `STUDIO_PG_META_URL`, `POSTGRES_*`, `PG_META_CRYPTO_KEY`, `SUPABASE_*`, `AUTH_JWT_SECRET` are set and consistent with your stack.
- [ ] `NEXT_PUBLIC_*` in the image match your real public URLs (rebuild if you change domains).

If something fails, check logs for `ECONNREFUSED`, `fetch failed`, or missing `EDGE_FUNCTIONS_MANAGEMENT_FOLDER` / `SNIPPETS_MANAGEMENT_FOLDER` (defaults exist in the Dockerfile).

For URL layout and auth redirects, see **[WIRING.md](../WIRING.md)** and **[SINGLE_DOMAIN.md](../SINGLE_DOMAIN.md)**.
