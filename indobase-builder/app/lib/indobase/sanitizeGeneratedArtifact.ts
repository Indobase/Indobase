import type { BoltAction } from '~/types/actions';
import { path as nodePath } from '~/utils/path';

const FILE_PATH_METADATA_REGEX = /^\s*<filePath>\s*(\/?[^<]+?)\s*<\/filePath>\s*(?:\r?\n)?/i;
const CONTENT_TYPE_METADATA_REGEX = /^\s*<contentType>[^<]*<\/contentType>\s*(?:\r?\n)?/i;

export function isPlaceholderGeneratedPath(filePath?: string): boolean {
  if (!filePath?.trim()) {
    return true;
  }

  const normalized = filePath.trim().replace(/^\/+/, '');
  return /^untitled-\d+\.txt$/i.test(normalized);
}

export function extractEmbeddedFilePathMetadata(content: string): { filePath?: string; content: string } {
  let cleaned = content;
  let filePath: string | undefined;

  const pathMatch = cleaned.match(FILE_PATH_METADATA_REGEX);

  if (pathMatch?.[1]) {
    filePath = pathMatch[1].trim();
    cleaned = cleaned.replace(FILE_PATH_METADATA_REGEX, '');
  }

  cleaned = cleaned.replace(CONTENT_TYPE_METADATA_REGEX, '');

  return {
    filePath,
    content: cleaned.replace(/^\s+/, ''),
  };
}

export function normalizeGeneratedFilePath(filePath: string): string {
  const trimmed = filePath.trim().replace(/\\/g, '/');
  const withoutWorkdir = trimmed.replace(/^\/home\/project\/?/, '');
  const withoutLeadingSlash = withoutWorkdir.replace(/^\/+/, '');

  return withoutLeadingSlash.replace(/\/{2,}/g, '/');
}

/** Map a generated path to a WebContainer workdir-relative path for fs writes. */
export function toWorkdirRelativePath(workdir: string, filePath: string): string {
  const normalized = normalizeGeneratedFilePath(filePath);

  if (filePath.startsWith(workdir)) {
    return nodePath.relative(workdir, filePath).replace(/\\/g, '/');
  }

  return normalized;
}

/** Absolute path under the WebContainer workdir for editor/files-store keys. */
export function toWorkdirAbsolutePath(workdir: string, filePath: string): string {
  const relativePath = toWorkdirRelativePath(workdir, filePath);
  return `${workdir}/${relativePath}`.replace(/\/{2,}/g, '/');
}

export function resolveGeneratedFileArtifact(filePath: string, content: string) {
  const embedded = extractEmbeddedFilePathMetadata(content);
  let resolvedPath = filePath;
  let resolvedContent = embedded.content;

  if (embedded.filePath && isPlaceholderGeneratedPath(filePath)) {
    resolvedPath = embedded.filePath;
  }

  if (isPlaceholderGeneratedPath(resolvedPath)) {
    const inferredPath = inferGeneratedPathFromContent(resolvedContent);

    if (inferredPath) {
      resolvedPath = inferredPath;
    }
  }

  const finalPath = isPlaceholderGeneratedPath(resolvedPath)
    ? resolvedPath
    : normalizeGeneratedFilePath(resolvedPath);

  return sanitizeGeneratedArtifact(finalPath, resolvedContent);
}

function inferGeneratedPathFromContent(content: string): string | undefined {
  const trimmed = content.trim();

  if (trimmed.startsWith('{') && trimmed.includes('"name"') && trimmed.includes('"scripts"')) {
    return 'package.json';
  }

  if (trimmed.includes('createRoot(') || trimmed.includes('ReactDOM.createRoot')) {
    return 'src/main.jsx';
  }

  if (trimmed.match(/^import\s+React/m) && trimmed.includes('export default function App')) {
    return 'src/App.jsx';
  }

  if (trimmed.includes('<!DOCTYPE html>') || trimmed.match(/<html[\s>]/i)) {
    return 'index.html';
  }

  return undefined;
}

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
    .replace(/EXPO_PUBLIC_SUPABASE_URL/g, 'EXPO_PUBLIC_INDOBASE_URL')
    .replace(/EXPO_PUBLIC_SUPABASE_ANON_KEY/g, 'EXPO_PUBLIC_INDOBASE_ANON_KEY')
    .replace(/EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY/g, 'EXPO_PUBLIC_INDOBASE_ANON_KEY')
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

  const sanitized = resolveGeneratedFileArtifact(action.filePath, action.content);

  return {
    ...action,
    filePath: sanitized.filePath,
    content: sanitized.content,
  };
}
