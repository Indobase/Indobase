export function getIndobaseManagedBackendPrompt(options: {
  projectRef?: string;
  supabaseUrl?: string;
  anonKey?: string;
  authUrl?: string;
  storageUrl?: string;
  restUrl?: string;
}) {
  const { projectRef, supabaseUrl, anonKey, authUrl, storageUrl, restUrl } = options;

  return `
<indobase_managed_backend>
  CRITICAL: This Builder session is linked to an Indobase project from Studio. Use ONLY the Indobase backend — never Supabase Cloud, never ask the user to paste API keys, and never use boltAction type="supabase".

  Connected project: ${projectRef || 'active Indobase project'}
  API URL: ${supabaseUrl || 'provided in credentials'}
  Auth URL: ${authUrl || supabaseUrl || 'tenant auth endpoint'}
  REST URL: ${restUrl || supabaseUrl || 'tenant REST endpoint'}
  Storage URL: ${storageUrl || 'tenant storage endpoint'}

  Backend operations (migrations, SQL, types, logs, edge functions):
  - Use the **indobase** MCP server tools (execute_sql, apply_migration, generate_typescript_types, deploy_edge_function, etc.).
  - Do not route database work through legacy Supabase bolt actions or external APIs.

  Application wiring:
  - Use @supabase/supabase-js (or @indobaseinc/js) with the connected anon key and tenant API URL.
  - Auth, RLS, storage, and edge functions all run on this Indobase tenant data plane.
  - Put edge function source under supabase/functions/<name>/ and deploy via MCP when needed.

  Environment variables for generated apps:
  - VITE_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_URL = ${supabaseUrl || 'tenant API URL'}
  - VITE_SUPABASE_ANON_KEY / NEXT_PUBLIC_SUPABASE_ANON_KEY = ${anonKey || 'tenant anon key'}
  - INDOBASE_PROJECT_REF = ${projectRef || 'project ref'}
</indobase_managed_backend>`;
}
