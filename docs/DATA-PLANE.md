# Data Plane

**Substrate for Execution** · Not an eighth OS contract — the primary **Execution adapter** for tenant backends.

Formal contract pointer for Builder/Studio: depend on Execution kinds + this doc, not ad-hoc compose assumptions.

## Split

| Host | Role |
|------|------|
| `.249` | Control plane: Studio, Builder, platform Postgres |
| `.248` | Data plane: provisioner `:8787`, per-project Docker stacks, Traefik `*.indobase.in` |

Tenant DBs live on `.249`; API containers on `.248` connect via Postgres bridge `:5433`.

## Modes

| Mode | Plan | Meaning |
|------|------|---------|
| `isolated_stack` | Pro+ | Per-tenant Traefik + `ref.indobase.in` |
| `shared_gateway` | Free/Basic | Shared gateway; usually still dedicated `tenantdb_<ref>` |
| `model_a` | Opt-in only | Shared DB + RLS (unsafe default) |

## Provision lifecycle

```text
createProject
  → dedicated DB + roles
  → allocate port base
  → Execution provision
  → health
  → ACTIVE_HEALTHY | stay PROVISIONING
```

## Runtime guarantees (contract summary)

| Concern | Guarantee |
|---------|-----------|
| Provisioner API | HTTP on `.248:8787` — routes mapped in Execution |
| Stack lifecycle | provision → healthy → repair/stop/teardown |
| Health | Provisioner `pingHttp`; GoTrue HEAD 405 + GET OK = healthy |
| Repair | `execution.repair` → `/repair-stack` (fleet self-heal) |
| Compose ABI | Host paths under `/var/lib/indobase/tenants` (not container `/mnt/tenants`) |
| Tenant states | PROVISIONING · ACTIVE_HEALTHY · degraded/repair · stopped |

Ops detail (secrets, Traefik attach, idle caps) stays in `docker/` runbooks — this file is the **contract**, not the runbook.

## Secrets alignment

`SAAS_DATA_PLANE_AUX_ROLE_PASSWORD` on Studio **and** provisioner must match SCRAM passwords for `authenticator` / tenant auth admin roles.  
Placeholder passwords only for local `trust` auth — never remote tenant stacks.

## Map to Execution

| Provisioner route | Execution kind |
|-------------------|----------------|
| `/provision` | `execution.provision` |
| `/repair-stack` | `execution.repair` |
| `/stop` | `execution.stop` |
| `/teardown` | `execution.teardown` |
| `/backup-tenant` | `execution.backup` |
| `/restore-tenant` | `execution.restore` |
| `/publish-site` | `execution.publish` (site) |

See also [EXECUTION.md](./EXECUTION.md) and `@indobase/platform` `PROVISIONER_ROUTE_TO_EXECUTION`.
