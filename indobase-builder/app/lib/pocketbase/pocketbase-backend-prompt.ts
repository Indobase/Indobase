export type PocketBaseBackendPromptOptions = {
  url?: string;
  appId?: string;
};

/**
 * User-facing and generated-app branding for the managed backend.
 * The underlying engine must NEVER be named in chat, UI, README, or product copy.
 */
export const POCKETBASE_BRANDING_RULES = `
<branding_rules>
  CRITICAL: This is Indobase Builder. Brand ONLY as "Indobase".

  For this session the app uses the Indobase backend (already linked):
  - Client module: \`src/lib/indobase.ts\` exporting a singleton \`indobase\`.
  - Environment variables: \`VITE_INDOBASE_URL\` (Vite) or \`NEXT_PUBLIC_INDOBASE_URL\` (Next.js).
  - Do NOT use \`@indobaseinc/indobase-js\` for this path — use the managed Indobase backend client below.
  - FORBIDDEN in user-visible chat, UI copy, README, comments shown to users, and marketing text: PocketBase, pocketbase, pb.indobase (as a product name). Say "Indobase backend" only.
  - Internal implementation detail (never explain to the user): the client may import the \`pocketbase\` npm package under the hood.
  - NEVER ask the user for backend URLs, admin credentials, or to open any Admin UI.
  - For Vite apps, configure \`server: { port: 5173, host: true }\` in vite.config (implementation detail — never explain to the user).
</branding_rules>
`;

export const POCKETBASE_DATABASE_INSTRUCTIONS = `
<database_instructions>
  CRITICAL: An Indobase backend is already available for this session.
  Do NOT ask the user to connect, paste URLs, or create collections manually.
  Do NOT mention PocketBase (or any other engine name) to the user — say "Indobase backend" only.

  USE THE BACKEND ONLY WHEN THE APP NEEDS IT. Static/local apps (timers, calculators, landing pages, games with no login)
  must be built with NO backend calls and NO collection setup.

  When the app needs auth or persistence:
  1. Call tool \`indobase_ensure_collection\` for every collection BEFORE wiring screens that read/write it.
  2. Use the exact \`name\` returned by the tool in \`indobase.collection(name)\`.
  3. Create \`src/lib/indobase.ts\` as shown in the managed-backend appendix.
  4. Ensure \`.env\` has \`VITE_INDOBASE_URL\` (seeded by Builder).
  5. Auth: prefer the built-in \`users\` auth collection via \`indobase.collection('users').authWithPassword\` when appropriate,
     or ensure a custom auth collection via tools first.
  6. Never invent mock APIs. Never emit boltAction type="indobase" SQL migrations for this path.
</database_instructions>
`;

export function getPocketBaseBackendPrompt(options: PocketBaseBackendPromptOptions = {}) {
  const url = options.url?.trim() || 'managed by Builder';
  const appId = options.appId?.trim() || 'session app';

  return `
<indobase_managed_backend>
  CRITICAL: Indobase backend is linked. Never ask the user for credentials. Never name the underlying engine in chat or generated UI/README.

  Backend URL (for .env only): ${url}
  App scope id: ${appId}

  Schema tools (use these — do not ask the user):
  - indobase_ensure_backend
  - indobase_ensure_collection
  - indobase_list_collections
  - indobase_backend_health

  Application wiring:
  - In package.json add dependency \`"pocketbase": "^0.25.0"\` (internal engine package — do not mention in UI/README).
  - File \`src/lib/indobase.ts\`:
    \`\`\`ts
    import BackendClient from 'pocketbase';
    const url = import.meta.env.VITE_INDOBASE_URL as string;
    export const indobase = new BackendClient(url);
    \`\`\`
  - Env: \`VITE_INDOBASE_URL=${url}\`
  - After ensure_collection, use the returned collection \`name\` with \`indobase.collection(name)\`.
  - Realtime (optional): \`indobase.collection(name).subscribe\` when needed.

  User-visible language: always "Indobase backend". Never "PocketBase".
</indobase_managed_backend>`;
}

export function getPocketBaseUserPreamble(_url?: string): string {
  return `INDOBASE BACKEND (agent-managed — available, not mandatory):
- Indobase backend is already provisioned. Never ask the user for API keys, URLs, or admin steps.
- Never name third-party engines to the user — say "Indobase backend" only.
- Landing/static apps: build UI only — no collections, no backend client calls.
- Apps that need auth or persistence: call indobase_ensure_collection tools first, then wire src/lib/indobase.ts + .env (VITE_INDOBASE_URL).

`;
}
