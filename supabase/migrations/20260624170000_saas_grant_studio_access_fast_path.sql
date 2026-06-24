-- Speed up steady-state Studio API boot: grant_studio_access() is invoked from ensureSaasTables.
-- Re-applying hundreds of GRANTs on every request caused 10s+ pg-meta timeouts and catalog deadlocks.

CREATE OR REPLACE FUNCTION saas.grant_studio_access()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'postgres')
     AND has_schema_privilege('postgres', 'saas', 'USAGE')
     AND has_table_privilege('postgres', 'saas.profiles', 'SELECT') THEN
    RETURN;
  END IF;

  PERFORM pg_advisory_lock(9625844491);
  BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'postgres') THEN
      EXECUTE 'GRANT USAGE, CREATE ON SCHEMA saas TO postgres';
      EXECUTE 'GRANT ALL ON ALL TABLES IN SCHEMA saas TO postgres';
      EXECUTE 'GRANT ALL ON ALL SEQUENCES IN SCHEMA saas TO postgres';
      EXECUTE 'GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA saas TO postgres';
    END IF;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_admin') THEN
      EXECUTE 'GRANT USAGE, CREATE ON SCHEMA saas TO supabase_admin';
      EXECUTE 'GRANT ALL ON ALL TABLES IN SCHEMA saas TO supabase_admin';
      EXECUTE 'GRANT ALL ON ALL SEQUENCES IN SCHEMA saas TO supabase_admin';
      EXECUTE 'GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA saas TO supabase_admin';
    END IF;
    PERFORM pg_advisory_unlock(9625844491);
  EXCEPTION
    WHEN OTHERS THEN
      PERFORM pg_advisory_unlock(9625844491);
      RAISE;
  END;
END
$fn$;
