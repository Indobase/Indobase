-- Per-project logical backup catalogue.
--
-- Each tenant lives in its own `tenantdb_<ref>` on a shared cluster, so PITR (cluster-wide WAL)
-- is not possible per project. The offering is instead a scheduled logical dump per tenant
-- (`pg_dump -Fc`) streamed to object storage, restorable independently. One row per dump attempt.
--
-- The actual dump/upload runs on the provisioner (VPS-side, next to Postgres + MinIO); Studio
-- orchestrates and records the result here. This table is the source of truth the dashboard reads,
-- replacing the previous hardcoded empty list in database-backups.ts.

create table if not exists saas.project_backups (
  id bigint generated always as identity primary key,
  project_ref text not null,
  -- Object-storage location of the dump (bucket-relative key); null until an upload succeeds.
  object_key text null,
  size_bytes bigint null,
  -- 'logical' = pg_dump custom format. Room for future 'physical' if the model ever supports it.
  kind text not null default 'logical' check (kind in ('logical')),
  status text not null default 'pending'
    check (status in ('pending', 'in_progress', 'completed', 'failed', 'expired', 'deleted')),
  error text null,
  -- Retention: dumps past this instant are pruned by the cron. Derived from the plan's
  -- backupRetentionDays at creation time.
  retention_until timestamptz null,
  started_at timestamptz not null default now(),
  completed_at timestamptz null,
  created_at timestamptz not null default now()
);

-- Dashboard lists a project's backups newest-first; the cron scans by retention.
create index if not exists saas_project_backups_ref_started_idx
  on saas.project_backups (project_ref, started_at desc);

create index if not exists saas_project_backups_retention_idx
  on saas.project_backups (retention_until)
  where status = 'completed';

comment on table saas.project_backups is
  'Scheduled per-tenant logical (pg_dump) backups. Dump/upload runs on the provisioner; Studio records results here.';
