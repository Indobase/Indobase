import { describe, expect, it } from 'vitest';
import { resolveMigrationFilePath } from './migrationPath';

describe('resolveMigrationFilePath', () => {
  it('returns absolute paths unchanged (with supabase path rewrite)', () => {
    expect(resolveMigrationFilePath('/indobase/migrations/create_users.sql')).toBe(
      '/indobase/migrations/create_users.sql',
    );
    expect(resolveMigrationFilePath('/supabase/migrations/legacy.sql')).toBe('/indobase/migrations/legacy.sql');
  });

  it('prefixes relative migration filenames', () => {
    expect(resolveMigrationFilePath('create_users.sql')).toBe('/indobase/migrations/create_users.sql');
  });

  it('generates a default path when filePath is missing', () => {
    const path = resolveMigrationFilePath();
    expect(path).toMatch(/^\/indobase\/migrations\/\d{4}-\d{2}-\d{2}T.+_migration\.sql$/);
  });
});
