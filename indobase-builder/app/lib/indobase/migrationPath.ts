/**
 * Resolve migration file paths from LLM artifact tags. Missing or partial paths
 * must not crash the UI — Indobase Builder assigns a default under indobase/migrations/.
 */
export function resolveMigrationFilePath(filePath?: string): string {
  const trimmed = filePath?.trim();

  if (trimmed) {
    if (trimmed.startsWith('/')) {
      return trimmed.replace(/\/supabase\/migrations\//g, '/indobase/migrations/');
    }

    return `/indobase/migrations/${trimmed}`;
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `/indobase/migrations/${stamp}_migration.sql`;
}
