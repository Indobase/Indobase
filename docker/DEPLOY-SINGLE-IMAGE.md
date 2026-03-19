# Deploy the dashboard image (step-by-step)

This is for running **only** the dashboard (marketing site + Studio) in one container — e.g. on Dokploy, Railway, or any host that runs Docker.

---

## 1. Have the image

- **From GitHub Actions:** After pushing to `main`, run the “Build and Push Docker Image” workflow. It pushes `roshanraghavander/ind-repo:latest` to Docker Hub (linux/amd64).
- **Or build locally:** From repo root run `./docker-build.sh` (then tag and push to your registry if needed).

---

## 2. Run the container

Example (replace with your image if different):

```bash
docker run -d \
  --name indobase-dashboard \
  -p 8080:8080 \
  roshanraghavander/ind-repo:latest
```

- Open **http://localhost:8080** → marketing site  
- Open **http://localhost:8080/dashboard** → Studio (dashboard)

If that works, you have the app running. The next step is telling it **where your backend is**.

---

## 3. Choose how Studio talks to the backend

Pick **one** of these.

### Option A – Use Indobase cloud (easiest)

Studio talks to your Indobase cloud API. No Postgres/Kong running next to the dashboard.

Set these when you run the container (or in Dokploy env):

```bash
NEXT_PUBLIC_IS_PLATFORM=true
NEXT_PUBLIC_API_URL=https://api.indobase.in   # or your real platform API URL
```

Example:

```bash
docker run -d \
  --name indobase-dashboard \
  -p 8080:8080 \
  -e NEXT_PUBLIC_IS_PLATFORM=true \
  -e NEXT_PUBLIC_API_URL=https://api.indobase.in \
  roshanraghavander/ind-repo:latest
```

**Note:** `NEXT_PUBLIC_*` is baked in at **build** time in Next.js. If you didn’t set these when the image was built, you need to rebuild the image with these env vars (e.g. in GitHub Actions as build args and `ARG`/`ENV` in the Dockerfile), or use a build that already has your platform URL. If your image is built without them, use Option B or add build args (see below).

### Option B – Use your own backend (self‑hosted stack)

You already run Postgres, Kong, postgres-meta, etc. (e.g. full `docker-compose` somewhere). Studio in this image must reach those services.

Set at least (when running the container or in Dokploy):

```bash
# Postgres (used by Studio for DB management UI, lints, etc.)
POSTGRES_HOST=your-postgres-host      # e.g. db or the real hostname
POSTGRES_PORT=5432
POSTGRES_PASSWORD=your-db-password
POSTGRES_DB=postgres

# postgres-meta API (Studio calls this for tables, SQL, etc.)
STUDIO_PG_META_URL=http://meta:8080   # or the URL where meta is reachable from this container

# Kong / API
SUPABASE_URL=http://kong:8000        # or your Kong URL
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_KEY=your-service-role-key
AUTH_JWT_SECRET=your-jwt-secret
```

If you use the full `docker-compose` from this repo, those values come from the same `.env`; just point `POSTGRES_HOST` and `STUDIO_PG_META_URL` so this container can reach them (same network or public URLs).

---

## 4. If you use Dokploy

1. **Create an application** that uses the image `roshanraghavander/ind-repo:latest` (or your registry URL).
2. **Port:** map container port **8080** to the port Dokploy/host uses (e.g. 80 or 443 behind a proxy).
3. **Env:** in Dokploy’s env / config, add the variables from **Option A** or **Option B** above.
4. **Deploy** and open the app URL; use `/dashboard` for Studio.

---

## 5. If “Platform” options don’t work (Option A)

Next.js bakes `NEXT_PUBLIC_*` into the build. So if the image was built **without** `NEXT_PUBLIC_IS_PLATFORM` and `NEXT_PUBLIC_API_URL`, setting them only at runtime is not enough. Then you have two choices:

- **Use Option B** and point Studio at your own backend (Postgres + Kong + meta), or  
- **Rebuild the image** with those env vars set at build time (e.g. in the Dockerfile or in GitHub Actions as build-args and `ARG`/`ENV` for the build stage).

---

## Quick checklist

- [ ] Image is built and pushed (e.g. `roshanraghavander/ind-repo:latest`).
- [ ] Container runs and you can open `:8080` and `:8080/dashboard`.
- [ ] Either Option A env vars (platform) or Option B env vars (self‑hosted) are set.
- [ ] If Option A: image was built with the right `NEXT_PUBLIC_*` or you rebuilt with them.

If something fails, check container logs for `EDGE_FUNCTIONS_MANAGEMENT_FOLDER`, `ECONNREFUSED`, or `fetch failed` — that usually means a missing env or the backend not reachable from the container.
