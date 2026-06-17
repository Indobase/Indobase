# Indobase Cloud Parity – Codebase Findings (Indobase)

Generated: 2026-05-06  
Scope: Review of this repository’s current implementation for “Supabase Cloud-like” capabilities, focusing on **presence vs. gaps** and where the code lives.

## Executive summary

### Present (shipping / functional in-repo)
- **SaaS control-plane metadata** (`saas.*`) with **RLS wiring** and org/project membership.
- **Per-project tenant DB provisioning (MVP)**: creates a dedicated Postgres DB + role per project and stores the DSN encrypted-at-rest.
- **Per-project anon/service keys (encrypted-at-rest)** generated on project create.
- **Per-project stack artifacts** (docker-compose + Traefik dynamic config) and a **provisioner** that writes configs to Dokploy’s Traefik dynamic directory and can start stacks.
- **Gateway attribution + quotas (MVP)**: Kong injects `x-project-ref` based on hostname and rate-limits key services by that header.

### Partially present (UI present, backend missing or external dependency)
- **Backups / PITR / restore**: Studio UI and “platform” API clients exist, but the actual backup/PITR engine is not implemented in this repo.
- **Billing / subscriptions**: Studio UI exists; Indobase SaaS API routes are stubbed/hard-coded; real Stripe billing lifecycle is not implemented here.
- **Ops controls (pause/restart)**: Studio UI/mutations exist, but Indobase SaaS data-plane execution is not fully implemented for your per-project stacks.
- **Audit logs**: Studio UI exists; Indobase SaaS audit endpoints are largely no-op / empty results.

### Missing (true Supabase Cloud parity gaps)
- **Tenant DB bootstrap** (auth/storage/realtime schema + roles + extensions) for new tenant DBs.
- **PITR/WAL archiving implementation** (wal-g/pgbackrest/barman), **automated backup schedules**, retention pruning.
- **Key rotation** for per-project anon/service keys and per-project JWT secrets (with grace periods + audit trails).
- **Full usage metering + hard quota enforcement** (beyond RPM limits), cost attribution under load.
- **End-to-end routing guardrails** for unknown `<project-ref>` hosts (explicit 404/catchall, validation that ref exists).

## Findings by capability

### 1) Data-plane routing + tenant isolation (Option A)
**Status: Partially present**

#### Implemented building blocks
- Traefik “control-plane only” routing for `api.indobase.in`:
  - `docker/traefik/indobase-backend-kong.yml`
- Kong hostname → `x-project-ref` injection (global pre-function):
  - `docker/volumes/api/kong.yml`
- Provisioner (Dokploy-friendly) writes tenant routing + compose and can apply `docker compose up -d`:
  - `docker/provisioner/server.mjs`
  - Wired into `docker/docker-compose.yml` as `data-plane-provisioner`
- Studio endpoints:
  - `apps/studio/pages/api/platform/projects/[ref]/tenant-stack.ts`
  - `apps/studio/pages/api/platform/projects/[ref]/provision-data-plane.ts`
- Tenant artifacts generation (compose + Traefik routers):
  - `apps/studio/lib/api/saas/platform.ts` (`getTenantStackArtifacts()`)
  - `docker/tenants/render-tenant-stack.mjs`

#### Critical gaps
- **Unknown `<project-ref>` host behavior** is not explicitly defined (no catchall router that returns 404).
- **Validation of `x-project-ref`** isn’t tied to `saas.projects` existence at the gateway level.
- **Generated tenant compose currently mixes DB sources** (risk of split-brain):
  - the generated stack includes a `tenant-db` container, but other services point at the provisioned DSN (`connection_string_enc`), so realtime vs rest/auth/storage may not share the same DB unless aligned.

### 2) Per-project keys (anon/service) + secrets hygiene
**Status: Present**

- Encrypted storage columns:
  - `saas.projects.connection_string_enc`
  - `saas.projects.anon_key_enc`
  - `saas.projects.service_key_enc`
  - `saas.projects.data_plane_port_base`
  - Defined in `docker/volumes/db/saas.sql`
  - Migrations:
    - `supabase/migrations/20260424094500_saas_project_connection_string_enc.sql`
    - `supabase/migrations/20260424095500_saas_project_jwt_keys_enc.sql`
    - `supabase/migrations/20260424096000_saas_project_data_plane_port_base.sql`
- Key generation + encrypted writes:
  - `apps/studio/lib/api/saas/platform.ts` (`createProject()`)
- Encryption utilities:
  - `apps/studio/lib/api/saas/util.ts`

**Gap:** Rotation workflows and audit logging for sensitive operations are not yet implemented for these per-project keys.

### 3) Tenant DB provisioning + bootstrap/migrations
**Status: Partially present**

- Tenant DB provisioning (DB + role):
  - `apps/studio/lib/api/saas/provision-tenant-db.ts`
- Control-plane metadata schema + RLS migration:
  - `docker/volumes/db/saas.sql`
  - `supabase/migrations/20260421101500_saas_tenant_isolation.sql`

**Critical gap:** No in-repo step to apply a **Supabase-compatible baseline schema** into newly created tenant DBs (auth/storage/realtime schemas, roles, extensions, triggers). Without this, tenant stacks will not be “fully functional” immediately after provisioning.

### 4) Backups / PITR / restore
**Status: Partially present (Studio UI + platform API clients)**

Implemented in Studio (frontend + API client calls):
- PITR UI:
  - `apps/studio/pages/project/[ref]/database/backups/pitr.tsx`
- Scheduled backups UI:
  - `apps/studio/pages/project/[ref]/database/backups/scheduled.tsx`
- API calls:
  - `apps/studio/data/database/backups-query.ts`
  - `apps/studio/data/database/backup-download-mutation.ts`
  - `apps/studio/data/database/backup-restore-mutation.ts`
  - `apps/studio/data/database/pitr-restore-mutation.ts`
  - `apps/studio/data/database/enable-physical-backups-mutation.ts`
- Restore-to-new-project UI:
  - `apps/studio/pages/project/[ref]/database/backups/restore-to-new-project.tsx`
  - `apps/studio/components/interfaces/Database/RestoreToNewProject/RestoreToNewProject.tsx`

**Missing in this repo:** the actual backup/PITR machinery (WAL archiving, restore commands, pgBackRest/WAL-G, scheduling/retention jobs). This likely must be implemented as an infra/control-plane service or integrated with your VPS runtime.

### 5) Usage metering + quotas + billing
**Status: Partially present**

#### Usage tracking (schema + functions)
- Schema:
  - `supabase/migrations/0001_usage_tracking_schema.sql`
- Collection:
  - `supabase/functions/usage-collector/index.ts` (contains several placeholder/zero collectors)
- Aggregation:
  - `supabase/functions/usage-aggregator/index.ts` (real aggregation logic)
- Quota checking / alerts:
  - `supabase/functions/quota-enforcer/index.ts` (hard enforcement is a placeholder)
  - `supabase/functions/send-alert-email/index.ts`

#### Billing (Studio UI + stubbed Indobase SaaS APIs)
- Studio subscription UI exists; Indobase SaaS API routes are stubbed:
  - `apps/studio/pages/api/platform/organizations/[slug]/billing/subscription.ts` (hard-coded response)
  - `apps/studio/pages/api/platform/billing/plans.ts` (hard-coded plans)
- Stripe “Sync Engine” integration exists (not billing lifecycle):
  - `apps/studio/pages/api/integrations/stripe-sync.ts`

#### Gateway quota (MVP)
- Kong `rate-limiting` plugin by `x-project-ref`:
  - `docker/volumes/api/kong.yml`

**Key gaps:**
- Hard quota enforcement is not wired into the real gateway/service mesh for all metrics.
- Billing lifecycle (Stripe subscriptions, invoices, cancellations, proration, plan enforcement) is not implemented in Indobase SaaS mode.
- Studio usage endpoint appears mismatched to schema in places (stale naming vs migration tables).

### 6) Ops controls (pause/restart) + recovery
**Status: Partially present**

- Pause/restart UI + mutations (cloud-style):
  - `apps/studio/components/interfaces/Settings/General/Infrastructure/PauseProjectButton.tsx`
  - `apps/studio/components/interfaces/Settings/General/Infrastructure/RestartServerButton.tsx`
  - `apps/studio/data/projects/project-pause-mutation.ts`
  - `apps/studio/data/projects/project-restart-mutation.ts`
  - `apps/studio/data/projects/project-restart-services-mutation.ts`

**Gap:** Indobase SaaS implementation must map these actions to your per-project Docker stacks (stop/start/recreate + health validation).

### 7) Audit logs
**Status: Partially present**

- Org audit logs UI exists:
  - `apps/studio/components/interfaces/Organization/AuditLogs/AuditLogs.tsx`
  - `apps/studio/data/organizations/organization-audit-logs-query.ts`
- Indobase SaaS profile audit endpoints are stub/no-op:
  - `apps/studio/pages/api/platform/profile/audit.ts`
  - `apps/studio/pages/api/platform/profile/audit-login.ts`

**Gap:** persist control-plane audit events in `saas.*` and expose them via APIs.

## Recommended “Supabase Cloud parity” next steps (ordered)

1) **Tenant DB bootstrap** (must-have): apply baseline schema + roles/extensions to every new tenant DB at provisioning time.
2) **Unify tenant stack DB usage**: ensure rest/auth/storage/realtime/functions all point at the same tenant DB (no split-brain).
3) **Unknown ref guardrails**: explicit Traefik catchall for `*.indobase.in` unknown refs → 404 + no internal routing.
4) **Backups/PITR implementation** for tenant DBs on VPS (pgBackRest/WAL-G) + retention jobs + restore flows.
5) **Key rotation + audit trail**: per-project anon/service key rotation + per-project JWT secret rotation, with grace periods.
6) **Usage metering + enforcement**: implement real collectors + integrate hard enforcement into gateway/services.
7) **Billing lifecycle**: implement Stripe subscription management for Indobase SaaS (or a dedicated control-plane service).

