-- Align control-plane privileges when Studio uses `postgres` + POSTGRES_PASSWORD
-- (schema/objects may have been created as supabase_admin).
DO $studio_grants$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'postgres') THEN
    EXECUTE 'GRANT USAGE ON SCHEMA saas TO postgres';
    EXECUTE 'GRANT ALL ON ALL TABLES IN SCHEMA saas TO postgres';
    EXECUTE 'GRANT ALL ON ALL SEQUENCES IN SCHEMA saas TO postgres';
    EXECUTE 'GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA saas TO postgres';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_admin') THEN
    EXECUTE 'GRANT USAGE ON SCHEMA saas TO supabase_admin';
    EXECUTE 'GRANT ALL ON ALL TABLES IN SCHEMA saas TO supabase_admin';
    EXECUTE 'GRANT ALL ON ALL SEQUENCES IN SCHEMA saas TO supabase_admin';
    EXECUTE 'GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA saas TO supabase_admin';
  END IF;
END
$studio_grants$;
