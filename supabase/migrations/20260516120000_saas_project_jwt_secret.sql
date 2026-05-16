-- Per-project JWT secret and update-status metadata for Studio JWT settings UI.

alter table saas.projects add column if not exists jwt_secret_enc text null;
alter table saas.projects add column if not exists jwt_secret_update_meta jsonb null;
