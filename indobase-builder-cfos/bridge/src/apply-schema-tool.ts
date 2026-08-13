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
## applySchema (INTERNAL — job / conductor only)

Not an agent tool. Agents must not call this.
The launch job applies a declarative data model (no arbitrary SQL).
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
