import { hasIndobaseStudioHandoff } from '~/lib/indobase/connection';
import { executeIndobaseSql } from '~/lib/indobase/studioSql';
import type { IndobaseConnectionState } from '~/lib/stores/indobase-connection';

/** Raw column row returned by the introspection query (via Studio SQL bridge). */
export type StudioSchemaColumnRow = {
  table_name: string;
  column_name: string;
  data_type: string;
  is_nullable: string | boolean | null;
  rls_enabled?: string | boolean | null;
  is_primary_key?: string | boolean | null;
};

export type StudioSchemaColumn = {
  name: string;
  type: string;
  nullable: boolean;
  primaryKey: boolean;
};

export type StudioSchemaTable = {
  name: string;
  rlsEnabled: boolean;
  columns: StudioSchemaColumn[];
};

const MAX_TABLES = 40;
const MAX_COLUMNS_PER_TABLE = 40;
const SCHEMA_TTL_MS = 30_000;

/**
 * Introspect user tables in the `public` schema: one row per column, with RLS flag and PK flag.
 * Restricted to base tables in `public` (the app schema) to keep the prompt compact.
 */
const INTROSPECTION_SQL = `
select
  c.table_name,
  c.column_name,
  c.data_type,
  c.is_nullable,
  coalesce(cls.relrowsecurity, false) as rls_enabled,
  coalesce(pk.is_pk, false) as is_primary_key
from information_schema.columns c
join pg_class cls
  on cls.relname = c.table_name
  and cls.relnamespace = 'public'::regnamespace
  and cls.relkind = 'r'
left join (
  select kcu.table_name, kcu.column_name, true as is_pk
  from information_schema.table_constraints tc
  join information_schema.key_column_usage kcu
    on kcu.constraint_name = tc.constraint_name
    and kcu.constraint_schema = tc.constraint_schema
  where tc.constraint_type = 'PRIMARY KEY'
    and tc.table_schema = 'public'
) pk on pk.table_name = c.table_name and pk.column_name = c.column_name
where c.table_schema = 'public'
order by c.table_name, c.ordinal_position
`;

function toBool(value: string | boolean | null | undefined): boolean {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return normalized === 'true' || normalized === 'yes' || normalized === 't';
  }

  return false;
}

/** Group flat column rows into per-table structures. Pure — safe to unit test. */
export function parseStudioSchemaRows(rows: StudioSchemaColumnRow[]): StudioSchemaTable[] {
  const byTable = new Map<string, StudioSchemaTable>();

  for (const row of rows) {
    if (!row?.table_name || !row?.column_name) {
      continue;
    }

    let table = byTable.get(row.table_name);

    if (!table) {
      table = { name: row.table_name, rlsEnabled: toBool(row.rls_enabled), columns: [] };
      byTable.set(row.table_name, table);
    }

    // RLS flag is table-wide; keep it true if any row reports it enabled.
    table.rlsEnabled = table.rlsEnabled || toBool(row.rls_enabled);
    table.columns.push({
      name: row.column_name,
      type: row.data_type || 'unknown',

      // information_schema.is_nullable is 'YES' / 'NO'.
      nullable: toBool(row.is_nullable),
      primaryKey: toBool(row.is_primary_key),
    });
  }

  return [...byTable.values()];
}

/**
 * Render the live schema as a compact prompt block. Pure — safe to unit test.
 * Returns an explicit "no tables yet" block when the schema is empty so the model
 * knows to create tables rather than assume an existing structure.
 */
export function formatStudioSchemaForPrompt(tables: StudioSchemaTable[]): string {
  if (tables.length === 0) {
    return [
      '<indobase_live_schema>',
      'The linked Indobase project has no user tables yet (the public schema is empty).',
      'Create tables via migrations as the app requires, and enable RLS on every new table.',
      '</indobase_live_schema>',
    ].join('\n');
  }

  const lines: string[] = [
    '<indobase_live_schema>',
    'Live schema of the linked Indobase project (public schema). Use these EXACT table and column',
    'names in generated code and SQL — do not invent or rename columns. Enable RLS on new tables.',
    '',
  ];

  const shownTables = tables.slice(0, MAX_TABLES);

  for (const table of shownTables) {
    lines.push(`Table: ${table.name}${table.rlsEnabled ? ' (RLS enabled)' : ' (RLS DISABLED — enable it)'}`);

    const shownColumns = table.columns.slice(0, MAX_COLUMNS_PER_TABLE);

    for (const column of shownColumns) {
      const tags = [column.primaryKey ? 'PK' : '', column.nullable ? 'nullable' : 'not null']
        .filter(Boolean)
        .join(', ');
      lines.push(`  - ${column.name} ${column.type}${tags ? ` [${tags}]` : ''}`);
    }

    if (table.columns.length > shownColumns.length) {
      lines.push(`  … ${table.columns.length - shownColumns.length} more columns`);
    }
  }

  if (tables.length > shownTables.length) {
    lines.push('', `… ${tables.length - shownTables.length} more tables not shown.`);
  }

  lines.push('</indobase_live_schema>');

  return lines.join('\n');
}

function extractRows(payload: unknown): StudioSchemaColumnRow[] {
  if (Array.isArray(payload)) {
    return payload as StudioSchemaColumnRow[];
  }

  const record = payload as { data?: unknown; result?: unknown } | null;

  if (Array.isArray(record?.data)) {
    return record!.data as StudioSchemaColumnRow[];
  }

  if (Array.isArray(record?.result)) {
    return record!.result as StudioSchemaColumnRow[];
  }

  return [];
}

type CacheEntry = { at: number; block: string };

const schemaCache = new Map<string, CacheEntry>();

/** Drop cached schema so the next prompt reflects freshly-applied migrations. */
export function invalidateStudioSchemaCache(projectRef?: string) {
  if (projectRef) {
    schemaCache.delete(projectRef);
  } else {
    schemaCache.clear();
  }
}

/**
 * Fetch (and cache) a compact live-schema prompt block for a Studio-linked connection.
 * Never throws — on failure it returns the last good block, or '' so chat can proceed.
 */
export async function getStudioSchemaPreamble(connection?: IndobaseConnectionState | null): Promise<string> {
  if (!hasIndobaseStudioHandoff(connection)) {
    return '';
  }

  const projectRef = connection.indobase?.projectRef || connection.selectedProjectId;

  if (!projectRef) {
    return '';
  }

  const cached = schemaCache.get(projectRef);

  if (cached && Date.now() - cached.at < SCHEMA_TTL_MS) {
    return cached.block;
  }

  try {
    const payload = await executeIndobaseSql({
      connection,
      operation: 'query',
      query: INTROSPECTION_SQL,
    });
    const tables = parseStudioSchemaRows(extractRows(payload));
    const block = `${formatStudioSchemaForPrompt(tables)}\n\n`;
    schemaCache.set(projectRef, { at: Date.now(), block });

    return block;
  } catch {
    // Never block a chat on introspection failure; reuse the last good snapshot if any.
    return cached?.block ?? '';
  }
}
