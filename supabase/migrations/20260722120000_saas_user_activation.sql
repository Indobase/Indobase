-- Activation milestone tracking.
--
-- "Activated" is defined as a user completing all four milestones:
--   project_created -> app_generated -> app_deployed -> first_api_request
--
-- These happen across Builder and Studio, minutes or days apart, so the state has to be durable
-- rather than inferred in a single session. One row per user; each milestone timestamp is written
-- once (first occurrence wins), which is what makes the analytics events idempotent — without this
-- a user re-deploying would re-fire `user.activated` and corrupt every activation-rate report.

create table if not exists saas.user_activation (
  gotrue_id uuid primary key,
  -- First-touch timestamps. Null = milestone not yet reached.
  project_created_at timestamptz null,
  app_generated_at timestamptz null,
  app_deployed_at timestamptz null,
  first_api_request_at timestamptz null,
  -- Set when all four are complete; also guards against emitting user.activated twice.
  activated_at timestamptz null,
  signed_up_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Activation-rate and time-to-activate queries scan by these.
create index if not exists saas_user_activation_activated_idx
  on saas.user_activation (activated_at);

comment on table saas.user_activation is
  'Per-user activation milestones. Timestamps are first-touch only so activation events fire exactly once.';
