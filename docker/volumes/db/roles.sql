-- NOTE: change to your own passwords for production environments
\set pgpass `echo "$POSTGRES_PASSWORD"`

ALTER USER authenticator WITH PASSWORD :'pgpass';
ALTER USER pgbouncer WITH PASSWORD :'pgpass';
ALTER USER supabase_auth_admin WITH PASSWORD :'pgpass';
ALTER USER supabase_functions_admin WITH PASSWORD :'pgpass';
ALTER USER supabase_storage_admin WITH PASSWORD :'pgpass';

-- Ensure the read-only user used by Studio exists and has the correct password.
-- The supabase/postgres image creates this role, but its password must match POSTGRES_PASSWORD
-- so that Studio can connect through it for read-only operations.
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'supabase_read_only_user') THEN
    CREATE ROLE supabase_read_only_user WITH LOGIN IN ROLE pg_read_all_data;
  END IF;
END
$$;
ALTER USER supabase_read_only_user WITH PASSWORD :'pgpass';
