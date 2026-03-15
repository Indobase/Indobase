# Build image for linux/amd64 (e.g. Dokploy server)

The image you built on your Mac is **linux/arm64**. Most servers (and Dokploy) are **linux/amd64**, so you get:

```text
no matching manifest for linux/amd64 in the manifest list
```

## Option A: Build on the Dokploy server (recommended)

On your **deployment server** (SSH into the machine running Dokploy):

```bash
# Clone your repo (or copy the repo + docker files)
git clone <your-repo-url> ind-repo-build && cd ind-repo-build

# Build for this machine's architecture (linux/amd64)
docker build -t roshanraghavander/ind-repo:latest .

# Push to Docker Hub (so Dokploy can pull it, or use the image locally)
docker login
docker push roshanraghavander/ind-repo:latest
```

Then in Dokploy use image: `roshanraghavander/ind-repo:latest` and deploy again.

**Or** skip Docker Hub and use the image only on this server:

- After `docker build -t roshanraghavander/ind-repo:latest .`, in Dokploy point to the **same** image name. If Dokploy runs on this host, it will use the locally built image.

## Option B: Build amd64 on your Mac (needs more RAM)

You need enough memory for the buildx build (Studio build is heavy):

1. In **Docker Desktop → Settings → Resources**, set **Memory** to at least **10 GB**.
2. From the repo root run:
   ```bash
   ./docker-build-amd64.sh roshanraghavander/ind-repo:latest
   docker push roshanraghavander/ind-repo:latest
   ```

If the build is still killed (exit 137), use **Option A** (build on the server).

## Option C: GitHub Actions (or other CI)

Add a workflow that runs on `ubuntu-latest` (amd64), runs `docker build` and `docker push` for `roshanraghavander/ind-repo:latest`. Then Dokploy can pull that image.
