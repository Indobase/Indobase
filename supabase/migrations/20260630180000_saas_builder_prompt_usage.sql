-- Track Builder chat prompts consumed per organization (free tier cap).
alter table saas.organizations
  add column if not exists builder_prompts_used integer not null default 0;

comment on column saas.organizations.builder_prompts_used is
  'Count of Builder build-mode user prompts consumed while on the free plan.';
