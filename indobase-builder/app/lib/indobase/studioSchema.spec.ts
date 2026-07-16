import { describe, expect, it } from 'vitest';

import { formatStudioSchemaForPrompt, parseStudioSchemaRows, type StudioSchemaColumnRow } from './studioSchema';

describe('parseStudioSchemaRows', () => {
  it('groups columns per table and coerces string/boolean flags', () => {
    const rows: StudioSchemaColumnRow[] = [
      {
        table_name: 'profiles',
        column_name: 'id',
        data_type: 'uuid',
        is_nullable: 'NO',
        rls_enabled: true,
        is_primary_key: true,
      },
      {
        table_name: 'profiles',
        column_name: 'email',
        data_type: 'text',
        is_nullable: 'YES',
        rls_enabled: true,
        is_primary_key: false,
      },
      {
        table_name: 'posts',
        column_name: 'id',
        data_type: 'bigint',
        is_nullable: 'NO',
        rls_enabled: false,
        is_primary_key: 'true',
      },
    ];

    const tables = parseStudioSchemaRows(rows);

    expect(tables.map((t) => t.name)).toEqual(['profiles', 'posts']);

    const profiles = tables[0];
    expect(profiles.rlsEnabled).toBe(true);
    expect(profiles.columns).toHaveLength(2);
    expect(profiles.columns[0]).toEqual({ name: 'id', type: 'uuid', nullable: false, primaryKey: true });
    expect(profiles.columns[1]).toEqual({ name: 'email', type: 'text', nullable: true, primaryKey: false });

    const posts = tables[1];
    expect(posts.rlsEnabled).toBe(false);
    expect(posts.columns[0].primaryKey).toBe(true); // 'true' string coerced
  });

  it('skips malformed rows without a table or column name', () => {
    const tables = parseStudioSchemaRows([
      { table_name: '', column_name: 'x', data_type: 'text', is_nullable: 'YES' },
      { table_name: 't', column_name: '', data_type: 'text', is_nullable: 'YES' },
    ] as StudioSchemaColumnRow[]);
    expect(tables).toEqual([]);
  });
});

describe('formatStudioSchemaForPrompt', () => {
  it('emits an explicit empty-state block when there are no tables', () => {
    const block = formatStudioSchemaForPrompt([]);
    expect(block).toContain('<indobase_live_schema>');
    expect(block).toContain('no user tables yet');
    expect(block).toContain('</indobase_live_schema>');
  });

  it('renders tables, columns, RLS markers, and PK/nullable tags', () => {
    const block = formatStudioSchemaForPrompt([
      {
        name: 'profiles',
        rlsEnabled: true,
        columns: [
          { name: 'id', type: 'uuid', nullable: false, primaryKey: true },
          { name: 'email', type: 'text', nullable: true, primaryKey: false },
        ],
      },
      {
        name: 'posts',
        rlsEnabled: false,
        columns: [{ name: 'id', type: 'bigint', nullable: false, primaryKey: true }],
      },
    ]);

    expect(block).toContain('Table: profiles (RLS enabled)');
    expect(block).toContain('- id uuid [PK, not null]');
    expect(block).toContain('- email text [nullable]');
    expect(block).toContain('Table: posts (RLS DISABLED — enable it)');
  });
});
