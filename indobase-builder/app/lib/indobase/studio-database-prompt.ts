/** Database instructions when Builder is linked from Studio (tenant backend + MCP). */
export const STUDIO_MANAGED_DATABASE_INSTRUCTIONS = `
<database_instructions>
  CRITICAL: This session is linked to an Indobase project from Studio. The backend is ALREADY connected — do NOT ask the user for API keys or to connect manually.

  USE THE BACKEND ONLY WHEN THE APP NEEDS IT. A backend is connected, but that does not mean this
  app requires one. Static/local apps — timers, calculators, converters, games, landing pages, or
  anything the user says needs no login — must be built with NO database calls and NO migrations.
  Writing the app files is always the priority; touching the database when the feature does not
  need persistence or auth wastes the run and delays a working preview.

  The live schema is already supplied in <indobase_live_schema> above. Do NOT call list_tables or
  otherwise re-introspect the database — you already have it.

  When the app genuinely needs persistence or auth:
  - ENSURE-FIRST: apply migrations / schema via indobase MCP or boltAction type="indobase" BEFORE wiring screens
    that read/write those tables. Never invent mock APIs, fake JSON backends, or third-party database URLs.
  - Prefer the **indobase** MCP server tools: execute_sql, apply_migration, generate_typescript_types, deploy_edge_function, etc.
  - You MAY also use boltAction type="indobase" (migration + query pair) — changes auto-apply to the linked tenant database.

  Application wiring (only for apps that actually use the backend):
  - Use \`@indobaseinc/indobase-js\` with \`createClient\` — never @supabase/supabase-js. In package.json pin \`"@indobaseinc/indobase-js": "^1.0.8"\` (the SDK is published at 1.x — 2.x versions DO NOT exist on npm and will fail npm install).
  - Create \`src/lib/indobase.ts\` exporting a singleton client.
  - Create \`.env\` with VITE_INDOBASE_URL and VITE_INDOBASE_ANON_KEY from the linked credentials (values are in the system context).
  - Put SQL migrations under \`indobase/migrations/\`.

  For EVERY database schema change:
  1. Write the migration file under indobase/migrations/
  2. Apply it via indobase MCP OR boltAction type="indobase" query with the same SQL
  3. THEN wire the frontend to read/write via the indobase client — not before

  DATA PRESERVATION: No destructive DROP/DELETE without explicit user request. No BEGIN/COMMIT/ROLLBACK. Enable RLS on new tables.
</database_instructions>`;

export function getStudioBackendUserPreamble(): string {
  return `INDOBASE BACKEND (Studio-linked — available, not mandatory):
- An Indobase tenant backend is already connected. Do not ask the user for API keys.
- Landing/static apps (no login, no data): build UI only — write NO migrations and make NO database calls.
- Apps that need auth or persistence: apply migrations via MCP / indobase actions FIRST, then wire
  src/lib/indobase.ts + .env (VITE_INDOBASE_URL / VITE_INDOBASE_ANON_KEY). Never invent mock APIs
  or third-party database URLs. Do not mark the feature complete until schema is applied and UI is wired.

`;
}

/**
 * Studio-injected context (backend instructions + the project's live schema) rides along in the
 * user message so the model sees it, but it is machinery — not something the user typed. Wrapping
 * it in a single tag gives the chat UI one exact thing to strip, so the transcript shows the user's
 * own words instead of our prompt engineering and the tenant's table list.
 *
 * Keep this tag in sync with STUDIO_CONTEXT_REGEX in ~/utils/constants.
 */
export function wrapStudioContext(body: string): string {
  return body.trim().length === 0 ? '' : `<indobase_studio_context>\n${body}</indobase_studio_context>\n\n`;
}
