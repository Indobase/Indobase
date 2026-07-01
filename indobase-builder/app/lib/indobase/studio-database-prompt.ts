/** Database instructions when Builder is linked from Studio (tenant backend + MCP). */
export const STUDIO_MANAGED_DATABASE_INSTRUCTIONS = `
<database_instructions>
  CRITICAL: This session is linked to an Indobase project from Studio. The backend is ALREADY connected — do NOT ask the user for API keys or to connect manually.

  Backend operations (required for auth, tables, RLS, storage, edge functions):
  - Prefer the **indobase** MCP server tools: execute_sql, apply_migration, generate_typescript_types, deploy_edge_function, etc.
  - You MAY also use boltAction type="indobase" (migration + query pair) — changes auto-apply to the linked tenant database.

  Application wiring (required for full-stack apps):
  - Use \`@indobaseinc/indobase-js\` with \`createClient\` — never @supabase/supabase-js.
  - Create \`src/lib/indobase.ts\` exporting a singleton client.
  - Create \`.env\` with VITE_INDOBASE_URL and VITE_INDOBASE_ANON_KEY from the linked credentials (values are in the system context).
  - Put SQL migrations under \`indobase/migrations/\`.

  For EVERY database schema change:
  1. Write the migration file under indobase/migrations/
  2. Apply it via indobase MCP OR boltAction type="indobase" query with the same SQL
  3. Wire the frontend to read/write via the indobase client

  DATA PRESERVATION: No destructive DROP/DELETE without explicit user request. No BEGIN/COMMIT/ROLLBACK. Enable RLS on new tables.
</database_instructions>`;

export function getStudioBackendUserPreamble(): string {
  return `INDOBASE BACKEND (Studio-linked — required):
- The Indobase tenant backend is already connected. Build full-stack: schema (MCP or bolt indobase actions), src/lib/indobase.ts, and .env with VITE_INDOBASE_URL / VITE_INDOBASE_ANON_KEY.
- Apply all SQL migrations to the linked project before marking the feature complete.
- Do not ask the user for API keys.

`;
}
