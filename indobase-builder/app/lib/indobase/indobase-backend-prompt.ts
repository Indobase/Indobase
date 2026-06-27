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
  CRITICAL: This Builder session is linked to an Indobase project from Studio. Use ONLY the Indobase backend — never ask the user to paste API keys, and never use boltAction type="supabase" (use the indobase MCP server instead).

  Connected project: ${projectRef || 'active Indobase project'}
  API URL: ${supabaseUrl || 'provided in credentials'}
  Auth URL: ${authUrl || supabaseUrl || 'tenant auth endpoint'}
  REST URL: ${restUrl || supabaseUrl || 'tenant REST endpoint'}
  Storage URL: ${storageUrl || 'tenant storage endpoint'}

  Backend operations (migrations, SQL, types, logs, edge functions):
  - Use the **indobase** MCP server tools (execute_sql, apply_migration, generate_typescript_types, deploy_edge_function, etc.).
  - Do not route database work through legacy bolt supabase actions or external cloud APIs.

  Application wiring:
  - Use \`@indobaseinc/indobase-js\` with \`createClient\` and the connected anon key + tenant API URL.
  - Create \`src/lib/indobase.ts\` exporting a singleton \`indobase\` client.
  - Auth, RLS, storage, and edge functions all run on this Indobase tenant data plane.
  - Put edge function source under \`indobase/functions/<name>/\` and deploy via MCP when needed.

  Environment variables for generated apps:
  - VITE_INDOBASE_URL / NEXT_PUBLIC_INDOBASE_URL = ${supabaseUrl || 'tenant API URL'}
  - VITE_INDOBASE_ANON_KEY / NEXT_PUBLIC_INDOBASE_ANON_KEY = ${anonKey || 'tenant anon key'}
  - INDOBASE_PROJECT_REF = ${projectRef || 'project ref'}
</indobase_managed_backend>`;
}
