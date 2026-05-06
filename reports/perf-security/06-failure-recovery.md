# 06) Failure & Recovery

Generated: 2026-05-06

## Goal
Validate failure modes and recovery for:
- Kong / Traefik routing
- Studio API routes
- Tenant stacks (Option A)
- Postgres (control-plane + tenant DBs)

## What exists in this codebase
- Provisioner can apply tenant stacks via `docker compose up -d`
  - `docker/provisioner/server.mjs`
- Some “restart pipeline” recovery patterns exist for replication components:
  - `apps/studio/data/replication/restart-pipeline-helper.ts`

## Gaps / caveats
- There is no unified “health manager” / supervisor in-repo that:
  - checks health across all tenant stacks
  - auto-repairs
  - escalates incidents

## Recommended failure drills (Dokploy/VPS)
### A) Gateway crash/restart
1) Restart Kong container
2) Verify:
   - `api.indobase.in` responds
   - tenant domains still route (if tenant routers exist)

### B) Tenant stack crash/restart
1) Stop a tenant service (e.g., tenant-rest)
2) Verify:
   - tenant endpoint returns error
   - recovery is possible via provisioner apply (compose up)

### C) DB restart
1) Restart Postgres
2) Verify:
   - Studio login + org/project listing
   - tenant endpoints recover

## What to capture in the report
- RTO (time to recover)
- RPO (data loss, if any)
- which components require manual action
- how errors show up in Studio UX

## Findings (current state)
Failure/recovery is mostly **manual orchestration** (Dokploy + compose apply). For Supabase-Cloud parity,
you’ll want automated health checks, alerting, and controlled rollouts.

