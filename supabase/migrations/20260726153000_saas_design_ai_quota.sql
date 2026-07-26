-- Design AI draft quota (mirrors video_ai_used).
alter table saas.organizations
  add column if not exists design_ai_used integer not null default 0;

comment on column saas.organizations.design_ai_used is
  'Consumed Design AI layout draft credits for the organization.';
