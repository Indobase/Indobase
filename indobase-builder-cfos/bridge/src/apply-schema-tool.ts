/**
 * applySchema — declarative tables for any web app backend.
 */

import { platformApplySchema } from './platform-api-client.js'

export const APPLY_SCHEMA_TOOL = {
  name: 'applySchema',
  aliases: ['createTables', 'apply_schema', 'scaffoldDataModel'] as const,
  description:
    'Apply a starter schema and/or custom tables for this customer product. ' +
    'Pass tables to customize freely (add invoices, bookings, etc.). Optional blueprint saas|ecommerce|booking|blog|dashboard seeds boilerplate. ' +
    'custom_only:true skips boilerplate. Requires ensureDatabase first. Do not use webFetch. Do not send arbitrary SQL.',
  method: 'POST' as const,
  path: '/api/os/tools/applySchema',
  wraps: '/api/os/data/apply-schema',
  parameters: {
    type: 'object',
    properties: {
      brand: { type: 'string' },
      blueprint: {
        type: 'string',
        description: 'Optional starter: saas | ecommerce | booking | blog | dashboard',
      },
      custom_only: {
        type: 'boolean',
        description: 'When true, only apply tables (skip starter blueprint)',
      },
      tables: {
        type: 'array',
        description:
          'Custom tables for this product. columns: name, type (text|number|bool|json|date|email), required. Optional public_read / authenticated_write.',
        items: { type: 'object' },
      },
    },
  },
} as const

export const APPLY_SCHEMA_AGENT_HARD_RULES = `
## applySchema (HARD PATH — after ensureDatabase, before UI that needs data)

1. Call **ensureDatabase** (or guidedBackend) first if not already ready.
2. **Starter:** guidedBackend / applySchema with blueprint saas|ecommerce|booking|blog|dashboard seeds a secure boilerplate.
3. **Customize freely:** pass \`tables\` for this customer's product (extra entities, different fields). Use \`custom_only: true\` when you only want custom tables. Example:
   { "tables": [
     { "name": "invoices", "columns": [
       { "name": "org_id", "type": "text", "required": true },
       { "name": "amount", "type": "number", "required": true },
       { "name": "status", "type": "text", "required": true }
     ] }
   ] }
4. Prefer owner-scoped writes; set \`public_read: true\` only for intentional storefront/public lists.
5. Wire the UI to session.backend. Never invent a third-party database.
6. Do not send arbitrary SQL; do not request world-open write rules.
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
  input: {
    brand?: string | null
    tables?: Array<Record<string, unknown>> | null
    blueprint?: string | null
    custom_only?: boolean | null
  },
) {
  const result = await platformApplySchema({
    gotrueId: session.gotrueId,
    email: session.email,
    workspaceRef: session.projectRef,
    brand: input.brand,
    tables: input.tables,
    blueprint: input.blueprint,
    custom_only: input.custom_only,
  })
  return {
    ...result,
    tool: 'applySchema' as const,
    claim_schema_ready: result.ok === true,
  }
}
