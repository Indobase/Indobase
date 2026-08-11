# Indobase platform pivot: Builder + PocketBase + app containers

## Decision

Non-technical users build in **Indobase Builder** only. Backend is **agent-managed PocketBase**. Live apps run as **Docker containers** (not Indobase Studio tenant data planes).

Indobase Studio + per-project Kong/GoTrue/PostgREST stacks are **retired** from the product path.

## VPS roles (target)

| Host | IP | Role |
|------|-----|------|
| **Builder** | `103.190.92.249` | Builder UI/API, marketing site, Traefik/Dokploy. Slim control plane. |
| **App host** (ex data-plane) | `103.190.92.248` | PocketBase + **app-host provisioner** + user production containers + Traefik for `*.indobase.in` app hosts. |
| **Staging / overflow** | `72.61.242.251` | Preview/staging app containers (and overflow). Not Studio/Builder once Builder stays on `.249`. |

Kubernetes is optional later; **Docker Compose / `docker run` per app** matches current ops and ships faster.

## User journey (no Studio)

1. Open `builder.indobase.in` → describe product.
2. Agents auto-provision PocketBase scope + collections (no URL/keys).
3. Preview in Builder.
4. **Go live** → Builder builds artifacts → app-host provisioner deploys a container → `https://{slug}.indobase.in`.

## What stays / what goes

### Keep on `.249`
- `indobase-builder` Swarm service
- `indobase-website` (marketing)
- Traefik / Dokploy as needed

### Move / add on `.248`
- Managed PocketBase (`pb.indobase.in` or `api-pb.indobase.in`)
- `indobase-app-host` provisioner (`:8791`)
- Per-app containers: static nginx **or** Node SSR
- Traefik routes for app subdomains

### Retire (phased)
- Studio Swarm service on `.249`
- Control-plane Kong/GoTrue/PostgREST/meta used only for Studio SaaS
- `data-plane-provisioner` + all `indobase-tenant-*` stacks on `.248`
- Staging Studio/Builder on Hostinger (once Builder is prod-only on `.249`)
- Studio handoff / MCP / prompt-quota coupling in Builder (replace with Builder-native auth + PocketBase)

## Cutover phases

### Phase A — parallel (safe)
1. Deploy PocketBase on `.248`.
2. Deploy app-host provisioner on `.248`.
3. Ship Builder changes: agent PocketBase + publish-to-app-host (no Studio required).
4. Point `pb.indobase.in` DNS at `.248`.
5. Keep Studio/tenants running but unused by new Builder builds.

### Phase B — freeze Studio path
1. Builder defaults: PocketBase only (ignore Studio handoff for new chats).
2. Stop creating new tenant stacks on `.248`.
3. Cap/idle remaining tenants; export any customer data they still need.

### Phase C — reclaim capacity
1. Scale down / remove `indobase-studio` on `.249`.
2. Tear down tenant compose stacks + old provisioner on `.248`.
3. Reclaim disk/CPU for user app containers.
4. Repurpose Hostinger staging as preview pool.

**Do not skip Phase A→B data export** if any paying tenant still uses `*.indobase.in` Auth/DB.

## Env (Builder → app host)

```bash
# Builder (.249)
POCKETBASE_PUBLIC_URL=https://pb.indobase.in
POCKETBASE_ADMIN_EMAIL=...
POCKETBASE_ADMIN_PASSWORD=...
APP_HOST_PROVISIONER_URL=http://103.190.92.248:8791
APP_HOST_PROVISIONER_TOKEN=...   # shared secret
APP_HOST_PUBLIC_BASE=https://indobase.in   # slug → https://{slug}.indobase.in
```

```bash
# App host (.248)
APP_HOST_TOKEN=...               # same as APP_HOST_PROVISIONER_TOKEN
APP_HOST_DOMAIN=indobase.in
APP_HOST_ROOT=/var/lib/indobase/apps
POCKETBASE_*                     # if PB runs on same host
```

## Why not keep Indobase data plane

Studio + dedicated stacks were built for Supabase-parity SaaS. PocketBase already covers auth/DB/files for Builder-generated apps. Running both doubles cost and ops. Container hosting on `.248` / staging gives users a production URL without Kong/GoTrue fleets.

## Related files

- `docker/docker-compose.pocketbase.yml`
- `docker/docs/POCKETBASE-BUILDER.md`
- `docker/app-host/` (provisioner)
- Builder: `app/lib/pocketbase/*`, publish → app-host
