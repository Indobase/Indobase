-- Studio connects via postgres-meta as `postgres` (or POSTGRES_USER_READ_WRITE) while `saas.*`
-- may be owned by `supabase_admin`. Non-superuser roles cannot GRANT on those objects.
-- This SECURITY DEFINER routine runs as its owner (typically `supabase_admin`) so grants succeed.

CREATE OR REPLACE FUNCTION saas.grant_studio_access()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
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
$fn$;

REVOKE ALL ON FUNCTION saas.grant_studio_access() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION saas.grant_studio_access() TO postgres;
DO $grant_exec$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_admin') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION saas.grant_studio_access() TO supabase_admin';
  END IF;
END
$grant_exec$;

-- Objects created later by supabase_admin (migrations) should inherit privileges for Studio's login.
DO $defaults$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_admin') THEN
    EXECUTE $ddl$
      ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA saas
      GRANT ALL ON TABLES TO postgres
    $ddl$;
    EXECUTE $ddl$
      ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA saas
      GRANT ALL ON SEQUENCES TO postgres
    $ddl$;
    EXECUTE $ddl$
      ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA saas
      GRANT EXECUTE ON FUNCTIONS TO postgres
    $ddl$;
  END IF;
END
$defaults$;
