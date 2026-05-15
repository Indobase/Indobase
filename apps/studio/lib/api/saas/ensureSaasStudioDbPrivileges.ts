import { executeQuery } from './query'

/**
 * Studio connects to the control-plane DB as POSTGRES_USER_READ_WRITE (often `postgres`)
 * while legacy installs may have created `saas.*` objects as `supabase_admin`.
 * Without explicit grants, `postgres` hits "permission denied for schema saas".
 *
 * Idempotent: safe to run on every ensureSaasTables().
 */
export const SAAS_STUDIO_DB_PRIVILEGES_SQL = `
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
`

export async function ensureSaasStudioDbPrivileges(): Promise<void> {
  const applied = await executeQuery({ query: SAAS_STUDIO_DB_PRIVILEGES_SQL })
  if (applied.error) throw applied.error
}
