/**
 * applySchema — declarative tables for any web app backend.
 */

import { platformApplySchema } from './platform-api-client.js'

export const APPLY_SCHEMA_TOOL = {
  name: 'applySchema',
  aliases: ['createTables', 'apply_schema', 'scaffoldDataModel'] as const,
  description:
    'Apply a declarative data model to the customer database (create tables safely). ' +
    'Use for SaaS, booking, blog, dashboard, or any app — not only shops. ' +
    'Requires ensureDatabase first. Do not use webFetch. Do not send arbitrary SQL.',
  method: 'POST' as const,
  path: '/api/os/tools/applySchema',
  wraps: '/api/os/data/apply-schema',
  parameters: {
    type: 'object',
    required: ['tables'],
    properties: {
      brand: { type: 'string' },
      tables: {
        type: 'array',
        description:
          'Tables to create. columns: name, type (text|uuid|integer|bigint|boolean|timestamptz|numeric|jsonb), primary_key, required, unique, default',
        items: { type: 'object' },
      },
    },
  },
} as const

export const APPLY_SCHEMA_AGENT_HARD_RULES = `
## applySchema (HARD PATH — after ensureDatabase, before UI that needs data)

1. Call **ensureDatabase** first if not already ready.
2. Call **applySchema** with the tables this product needs **before** building screens that read/write those tables. Example SaaS:
   { "brand": "Acme", "tables": [
     { "name": "organizations", "columns": [
       { "name": "id", "type": "uuid", "primary_key": true, "default": "gen_random_uuid()" },
       { "name": "name", "type": "text", "required": true },
       { "name": "slug", "type": "text", "unique": true, "required": true }
     ], "authenticated_write": true },
     { "name": "memberships", "columns": [
       { "name": "org_id", "type": "uuid", "required": true },
       { "name": "user_id", "type": "uuid", "required": true },
       { "name": "role", "type": "text", "required": true, "default": "'member'" }
     ] }
   ] }
3. Booking: resources, slots, bookings. Blog: posts, tags. Dashboard: metrics_events.
4. Ecommerce inventory: prefer **setupShopCatalog** / **guidedBackend**. Or applySchema + your own orders tables.
5. ONLY claim a real backend after applySchema (or setupShopCatalog) returns ok:true.
6. Wire the UI to project REST + Auth (session.backend). Never invent a third-party database.
7. Pass declarative tables only — do not send arbitrary SQL.
`.trim()

export function applySchemaToolCatalog() {
  return {
    name: APPLY_SCHEMA_TOOL.name,
    aliases: [...APPLY_SCHEMA_TOOL.aliases],
    description: APPLY_SCHEMA_TOOL.description,
    method: APPLY_SCHEMA_TOOL.method,
    path: APPLY_SCHEMA_TOOL.path,
    wraps: APPLY_SCHEMA_TOOL.wraps,
    parameters: APPLY_SCHEMA_TOOL.parameters,
    rules: APPLY_SCHEMA_AGENT_HARD_RULES,
  }
}

export async function executeApplySchema(
  session: { gotrueId: string; email: string; projectRef: string },
  input: { brand?: string | null; tables?: Array<Record<string, unknown>> | null },
) {
  const result = await platformApplySchema({
    gotrueId: session.gotrueId,
    email: session.email,
    workspaceRef: session.projectRef,
    brand: input.brand,
    tables: input.tables,
  })
  return {
    ...result,
    tool: 'applySchema' as const,
    claim_schema_ready: result.ok === true,
  }
}
