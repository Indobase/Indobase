-- Adds invite expiry for SaaS org invites.
-- Tokens should not be valid indefinitely.

alter table if exists saas.organization_invites
  add column if not exists expires_at timestamptz null;

-- Backfill existing rows (7 days from creation) where missing.
update saas.organization_invites
set expires_at = inserted_at + interval '7 days'
where expires_at is null;

create index if not exists organization_invites_expires_at_idx
  on saas.organization_invites (expires_at);

