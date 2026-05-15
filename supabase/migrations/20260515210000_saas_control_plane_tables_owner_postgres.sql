-- Studio connects as `postgres` and applies RLS bootstrap via postgres-meta.
-- ALTER TABLE ... ENABLE ROW LEVEL SECURITY and CREATE POLICY require table ownership
-- (or superuser). Core saas.* tables are often created by `supabase_admin` during image init.
-- Transfer ownership to `postgres` so runtime bootstrap and trigger/function updates succeed.
--
-- Keep `saas.grant_studio_access()` owned by `supabase_admin` so SECURITY DEFINER grants
-- from the object owner still work when objects are owned by supabase_admin again.

DO $body$
DECLARE
  fq text;
BEGIN
  FOR fq IN
    SELECT format('%I.%I', n.nspname, c.relname)
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'saas'
      AND c.relkind = 'r'
      AND c.relname IN (
        'profiles',
        'organizations',
        'organization_members',
        'organization_invites',
        'projects',
        'user_notifications',
        'integration_connections',
        'audit_logs',
        'custom_domains',
        'third_party_auth_integrations'
      )
  LOOP
    EXECUTE format('ALTER TABLE %s OWNER TO postgres', fq);
  END LOOP;
END
$body$;

-- Serial / identity sequences in saas
DO $body$
DECLARE
  fq text;
BEGIN
  FOR fq IN
    SELECT format('%I.%I', n.nspname, c.relname)
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'saas'
      AND c.relkind = 'S'
  LOOP
    BEGIN
      EXECUTE format('ALTER SEQUENCE %s OWNER TO postgres', fq);
    EXCEPTION
      WHEN insufficient_privilege THEN NULL;
      WHEN OTHERS THEN NULL;
    END;
  END LOOP;
END
$body$;

-- Functions Studio replaces at runtime; skip grant_studio_access (must stay supabase_admin-owned).
DO $body$
DECLARE
  sig text;
BEGIN
  FOR sig IN
    SELECT p.oid::regprocedure::text
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'saas'
      AND p.proname IS DISTINCT FROM 'grant_studio_access'
  LOOP
    BEGIN
      EXECUTE format('ALTER FUNCTION %s OWNER TO postgres', sig);
    EXCEPTION
      WHEN insufficient_privilege THEN NULL;
      WHEN OTHERS THEN NULL;
    END;
  END LOOP;
END
$body$;
