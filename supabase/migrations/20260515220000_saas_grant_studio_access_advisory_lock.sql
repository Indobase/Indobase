-- Parallel Studio requests can call grant_studio_access concurrently; concurrent GRANTs on the same
-- catalog rows can raise "tuple concurrently updated". Serialize with a session advisory lock.

CREATE OR REPLACE FUNCTION saas.grant_studio_access()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
BEGIN
  PERFORM pg_advisory_lock(9625844491); -- keep in sync with SAAS_PG_ADVISORY_LOCK_GRANT_STUDIO_ACCESS
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
    PERFORM pg_advisory_unlock(9625844491); -- SAAS_PG_ADVISORY_LOCK_GRANT_STUDIO_ACCESS
  EXCEPTION
    WHEN OTHERS THEN
      PERFORM pg_advisory_unlock(9625844491); -- SAAS_PG_ADVISORY_LOCK_GRANT_STUDIO_ACCESS
      RAISE;
  END;
END
$fn$;
