# Dokploy: auto-deploy Studio image from GitHub Actions

CI pushes `roshanraghavander/ind-repo:latest` and `roshanraghavander/ind-repo:<commit-sha>` on every push to `main`, then calls your Dokploy deploy webhook and polls `https://studio.indobase.in/api/health` until `version` matches the commit.

If the GitHub Actions **Smoke test** step shows a warning (**prod did not pick up commit …**), the image is on Docker Hub but **Dokploy did not run a new container with that image**. The workflow still **passes** (build + push succeeded); fix Dokploy and redeploy manually.

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

Set these GitHub secrets to deploy via API (updates image to the exact commit tag before deploy):

- `DOKPLOY_API_URL` — e.g. `https://your-dokploy-host`
- `DOKPLOY_API_KEY` — from Dokploy profile → API/CLI
- `DOKPLOY_APPLICATION_ID` — from `GET /api/project.all`

See `.github/workflows/docker-publish.yml` step **Deploy via Dokploy API**.
