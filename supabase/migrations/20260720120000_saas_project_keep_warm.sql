-- Per-project "keep warm" pin, exempting a project from idle sleep.
--
-- Basic and Pro sleep after 30 quiet days (plan-entitlements.idleSleepDays). Pro additionally
-- carries `canPinProject`, letting an owner mark one project always-warm so a low-traffic
-- production app never pays a cold start. Without this column that entitlement has no mechanism.
--
-- Note this is a HINT to the graceful idle-sleep job, not a capacity guarantee: the host-level
-- capacity valve (docker/scripts/cap-idle-tenant-stacks.sh) may still stop a pinned stack if
-- pinned projects alone exceed what the host can run.

alter table saas.projects
  add column if not exists keep_warm boolean not null default false;

comment on column saas.projects.keep_warm is
  'Owner pinned this project to skip idle sleep. Only honoured on plans with canPinProject.';

-- The idle sweep and the capacity valve both filter on this; keep the lookup cheap.
create index if not exists saas_projects_keep_warm_idx
  on saas.projects (keep_warm)
  where keep_warm = true;
