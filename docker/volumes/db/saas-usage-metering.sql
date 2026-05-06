-- Direct metering: Vector -> Postgres (saas.usage_events)
--
-- This is intentionally self-contained and safe to run on fresh init.
-- It does not depend on Studio bootstrapping `saas.*`.

create schema if not exists saas;

create table if not exists saas.usage_events (
  event_id uuid primary key,
  occurred_at timestamptz not null,
  project_ref text not null,
  host text null,
  method text null,
  path text null,
  status_code integer null,
  bytes_sent bigint null,
  request_time_s double precision null,
  upstream_response_time_s double precision null,
  service text null
);

create index if not exists usage_events_project_ref_occurred_at_idx
  on saas.usage_events (project_ref, occurred_at desc);

-- Billing-grade daily rollup (query-time view; can be materialized later).
create or replace view saas.usage_daily as
select
  date_trunc('day', occurred_at)::date as day,
  project_ref,
  count(*)::bigint as requests,
  sum(coalesce(bytes_sent, 0))::bigint as bytes_sent,
  sum(case when coalesce(status_code, 0) >= 400 then 1 else 0 end)::bigint as errors,
  avg(request_time_s) as avg_request_time_s,
  percentile_cont(0.95) within group (order by request_time_s) as p95_request_time_s,
  percentile_cont(0.99) within group (order by request_time_s) as p99_request_time_s
from saas.usage_events
group by 1, 2;

