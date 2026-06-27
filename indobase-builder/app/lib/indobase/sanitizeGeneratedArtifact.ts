import type { BoltAction } from '~/types/actions';

export function sanitizeGeneratedArtifactPath(filePath: string): string {
  return filePath
    .replace(/\/supabase\/migrations\//g, '/indobase/migrations/')
    .replace(/\/supabase\/functions\//g, '/indobase/functions/')
    .replace(/\/lib\/supabase\.(ts|tsx|js|jsx)$/i, '/lib/indobase.$1')
    .replace(/\/supabase\.(ts|tsx|js|jsx)$/i, '/indobase.$1');
}

function rewriteSupabaseImportPath(importPath: string): string {
  return importPath.replace(/\/lib\/supabase$/, '/lib/indobase').replace(/\/supabase$/, '/indobase');
}

export function sanitizeGeneratedArtifactContent(content: string): string {
  return content
    .replace(/@supabase\/supabase-js/g, '@indobaseinc/indobase-js')
    .replace(/from (['"])([^'"]*supabase[^'"]*)\1/g, (match, quote, importPath) => {
      if (!importPath.includes('supabase')) {
        return match;
      }

      return `from ${quote}${rewriteSupabaseImportPath(importPath)}${quote}`;
    })
    .replace(/VITE_SUPABASE_URL/g, 'VITE_INDOBASE_URL')
    .replace(/VITE_SUPABASE_ANON_KEY/g, 'VITE_INDOBASE_ANON_KEY')
    .replace(/NEXT_PUBLIC_SUPABASE_URL/g, 'NEXT_PUBLIC_INDOBASE_URL')
    .replace(/NEXT_PUBLIC_SUPABASE_ANON_KEY/g, 'NEXT_PUBLIC_INDOBASE_ANON_KEY')
    .replace(/\bSUPABASE_URL\b/g, 'INDOBASE_URL')
    .replace(/\bSUPABASE_ANON_KEY\b/g, 'INDOBASE_ANON_KEY')
    .replace(/\bconst supabase\s*=/g, 'const indobase =')
    .replace(/\blet supabase\s*=/g, 'let indobase =')
    .replace(/\bexport const supabase\s*=/g, 'export const indobase =')
    .replace(/\bimport \{ supabase \}/g, 'import { indobase }')
    .replace(/\bawait supabase\./g, 'await indobase.')
    .replace(/\bsupabase\./g, 'indobase.')
    .replace(/Indobase backend integration using @supabase\/supabase-js/gi, 'Indobase backend integration using @indobaseinc/indobase-js')
    .replace(/using @supabase\/supabase-js/gi, 'using @indobaseinc/indobase-js')
    .replace(/\bsupabase\.ts\b/g, 'indobase.ts');
}

export function sanitizeGeneratedArtifact(filePath: string, content: string) {
  return {
    filePath: sanitizeGeneratedArtifactPath(filePath),
    content: sanitizeGeneratedArtifactContent(content),
  };
}

export function sanitizeFileAction<T extends BoltAction>(action: T): T {
  if (action.type !== 'file') {
    return action;
  }

  const sanitized = sanitizeGeneratedArtifact(action.filePath, action.content);

  return {
    ...action,
    filePath: sanitized.filePath,
    content: sanitized.content,
  };
}
