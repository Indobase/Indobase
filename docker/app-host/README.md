# App host (user production containers)

Replaces Indobase tenant data-plane stacks for Builder + PocketBase apps.

## Deploy on `.248` (ex data-plane)

```bash
ssh root@103.190.92.248
mkdir -p /opt/indobase-app-host
# copy docker/app-host/* here
export APP_HOST_TOKEN='long-random-secret'
export APP_HOST_DOMAIN=indobase.in
docker compose -f /opt/indobase-app-host/docker-compose.yml up -d
curl -sS http://127.0.0.1:8791/health
```

Ensure Traefik on `.248` can see containers on network `indobase-apps` (attach Traefik to that network).

## Builder env on `.249`

```bash
APP_HOST_PROVISIONER_URL=http://103.190.92.248:8791
APP_HOST_PROVISIONER_TOKEN=<same as APP_HOST_TOKEN>
POCKETBASE_PUBLIC_URL=https://pb.indobase.in
POCKETBASE_ADMIN_EMAIL=...
POCKETBASE_ADMIN_PASSWORD=...
```

## API

- `GET /health`
- `POST /deploy` `{ slug, files }` → nginx container + Traefik labels
- `GET /apps`
- `DELETE /apps/:slug`

See `docs/BUILDER-PLATFORM-PIVOT.md` for full VPS cutover.
