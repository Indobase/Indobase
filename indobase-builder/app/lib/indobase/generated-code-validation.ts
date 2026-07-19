import { parse } from '@babel/parser';

export type GeneratedCodeDiagnostic = {
  filePath: string;
  message: string;
  line?: number;
  column?: number;
  source: 'syntax' | 'preview' | 'structure';
};

const GENERATED_SOURCE_EXTENSION = /\.(?:[cm]?[jt]sx?)$/i;
const IGNORED_DIRECTORIES = new Set(['.git', '.history', 'build', 'dist', 'node_modules']);
const LEAKED_ARTIFACT_MARKUP = /<\/?(?:boltArtifact|boltAction|bolt-quick-actions)\b/i;

function formatLocation(diagnostic: GeneratedCodeDiagnostic): string {
  const line = diagnostic.line == null ? '' : `:${diagnostic.line}`;
  const column = diagnostic.column == null ? '' : `:${diagnostic.column}`;

  return `${diagnostic.filePath}${line}${column}`;
}

export function formatGeneratedCodeDiagnostics(diagnostics: GeneratedCodeDiagnostic[]): string {
  return diagnostics.map((diagnostic) => `${formatLocation(diagnostic)} — ${diagnostic.message}`).join('\n');
}

export class GeneratedCodeValidationError extends Error {
  readonly diagnostics: GeneratedCodeDiagnostic[];

  constructor(diagnostics: GeneratedCodeDiagnostic[], prefix = 'Generated code validation failed') {
    super(`${prefix}:\n${formatGeneratedCodeDiagnostics(diagnostics)}`);
    this.name = 'GeneratedCodeValidationError';
    this.diagnostics = diagnostics;
  }
}

function jsxAttributeName(attribute: any): string | undefined {
  if (attribute?.type !== 'JSXAttribute') {
    return undefined;
  }

  if (attribute.name?.type === 'JSXIdentifier') {
    return attribute.name.name;
  }

  if (attribute.name?.type === 'JSXNamespacedName') {
    return `${attribute.name.namespace?.name}:${attribute.name.name?.name}`;
  }

  return undefined;
}

function findDuplicateJsxAttributes(node: any, filePath: string, diagnostics: GeneratedCodeDiagnostic[]) {
  if (!node || typeof node !== 'object') {
    return;
  }

  if (node.type === 'JSXOpeningElement' && Array.isArray(node.attributes)) {
    const seen = new Set<string>();

    for (const attribute of node.attributes) {
      const name = jsxAttributeName(attribute);

      if (!name) {
        continue;
      }

      if (seen.has(name)) {
        diagnostics.push({
          filePath,
          message: `Duplicate JSX attribute "${name}".`,
          line: attribute.loc?.start?.line,
          column: attribute.loc?.start?.column == null ? undefined : attribute.loc.start.column + 1,
          source: 'syntax',
        });
      }

      seen.add(name);
    }
  }

  for (const [key, value] of Object.entries(node)) {
    if (key === 'loc' || key === 'start' || key === 'end') {
      continue;
    }

    if (Array.isArray(value)) {
      for (const child of value) {
        findDuplicateJsxAttributes(child, filePath, diagnostics);
      }
    } else if (value && typeof value === 'object') {
      findDuplicateJsxAttributes(value, filePath, diagnostics);
    }
  }
}

export function validateGeneratedSource(filePath: string, content: string): GeneratedCodeDiagnostic[] {
  if (!GENERATED_SOURCE_EXTENSION.test(filePath)) {
    return [];
  }

  const leakedMarkup = LEAKED_ARTIFACT_MARKUP.exec(content);

  if (leakedMarkup) {
    const before = content.slice(0, leakedMarkup.index);
    const lines = before.split('\n');

    return [
      {
        filePath,
        message: 'Builder artifact markup leaked into generated source.',
        line: lines.length,
        column: lines[lines.length - 1].length + 1,
        source: 'syntax',
      },
    ];
  }

  try {
    const ast = parse(content, {
      sourceType: 'unambiguous',
      allowReturnOutsideFunction: false,
      plugins: [
        'jsx',
        ...(filePath.toLowerCase().match(/\.(?:[cm]?ts|tsx)$/) ? (['typescript'] as const) : []),
        'decorators-legacy',
        'classProperties',
        'dynamicImport',
        'importMeta',
        'topLevelAwait',
      ],
    });
    const diagnostics: GeneratedCodeDiagnostic[] = [];
    findDuplicateJsxAttributes(ast, filePath, diagnostics);

    return diagnostics;
  } catch (error) {
    const parserError = error as Error & { loc?: { line?: number; column?: number } };

    return [
      {
        filePath,
        message: parserError.message.replace(/\s*\(\d+:\d+\)\s*$/, ''),
        line: parserError.loc?.line,
        column: parserError.loc?.column == null ? undefined : parserError.loc.column + 1,
        source: 'syntax',
      },
    ];
  }
}

export function validateGeneratedSources(files: Record<string, string>): GeneratedCodeDiagnostic[] {
  return Object.entries(files).flatMap(([filePath, content]) => validateGeneratedSource(filePath, content));
}

const IMPORT_SPECIFIER_PATTERN =
  /(?:\bimport\s+(?:[^'"]*?\bfrom\s+)?|\bexport\s+[^'"]*?\bfrom\s+|\bimport\s*\(\s*|\brequire\s*\(\s*)['"]([^'"]+)['"]/g;

const RESOLVABLE_SUFFIXES = [
  '',
  '.tsx',
  '.ts',
  '.jsx',
  '.js',
  '.mjs',
  '.cjs',
  '/index.tsx',
  '/index.ts',
  '/index.jsx',
  '/index.js',
];

function normalizePath(path: string): string {
  const segments: string[] = [];

  for (const segment of path.split('/')) {
    if (segment === '' || segment === '.') {
      continue;
    }

    if (segment === '..') {
      segments.pop();
      continue;
    }

    segments.push(segment);
  }

  return segments.join('/');
}

function lineOfIndex(content: string, index: number): number {
  return content.slice(0, index).split('\n').length;
}

/**
 * Detects incomplete scaffolds: a generated source imports a relative module (e.g. App.tsx →
 * ./components/JuiceCards) that was never written because the model stream ended mid-artifact.
 * Only extensionless or source-extension specifiers are checked — assets (css/svg/png) are not in
 * the collected source map and would false-positive.
 */
export function findMissingLocalImportDiagnostics(files: Record<string, string>): GeneratedCodeDiagnostic[] {
  const normalizedFiles = new Set(Object.keys(files).map((filePath) => normalizePath(filePath)));
  const diagnostics: GeneratedCodeDiagnostic[] = [];

  for (const [filePath, content] of Object.entries(files)) {
    if (!GENERATED_SOURCE_EXTENSION.test(filePath)) {
      continue;
    }

    const directory = normalizePath(filePath).split('/').slice(0, -1).join('/');

    for (const match of content.matchAll(IMPORT_SPECIFIER_PATTERN)) {
      const specifier = match[1];

      if (!specifier.startsWith('./') && !specifier.startsWith('../')) {
        continue;
      }

      const hasExplicitExtension = /\.[a-z0-9]+$/i.test(specifier);

      if (hasExplicitExtension && !GENERATED_SOURCE_EXTENSION.test(specifier)) {
        continue;
      }

      const base = normalizePath(directory ? `${directory}/${specifier}` : specifier);
      const resolved = RESOLVABLE_SUFFIXES.some((suffix) => normalizedFiles.has(`${base}${suffix}`));

      if (!resolved) {
        diagnostics.push({
          filePath,
          message: `Missing file for import "${specifier}" — the referenced module was never generated. Create it (or fix the import path).`,
          line: lineOfIndex(content, match.index ?? 0),
          source: 'structure',
        });
      }
    }
  }

  return diagnostics;
}

type GeneratedFs = {
  readdir: (
    path: string,
    options?: { withFileTypes?: boolean },
  ) => Promise<Array<string | { name: string; isDirectory?: () => boolean }>>;
  readFile: (path: string, encoding: 'utf-8') => Promise<string>;
};

export async function collectGeneratedSources(
  fs: GeneratedFs,
  root = '.',
  maxFiles = 400,
): Promise<Record<string, string>> {
  const files: Record<string, string> = {};

  async function visit(directory: string): Promise<void> {
    if (Object.keys(files).length >= maxFiles) {
      return;
    }

    const entries = await fs.readdir(directory, { withFileTypes: true });

    for (const entry of entries) {
      const name = typeof entry === 'string' ? entry : entry.name;

      if (!name || IGNORED_DIRECTORIES.has(name)) {
        continue;
      }

      const filePath = directory === '.' ? name : `${directory}/${name}`;
      const isDirectory = typeof entry !== 'string' && entry.isDirectory?.();

      if (isDirectory) {
        await visit(filePath);
        continue;
      }

      if (!GENERATED_SOURCE_EXTENSION.test(filePath)) {
        if (typeof entry === 'string') {
          try {
            await visit(filePath);
          } catch {
            // A string entry may be a regular non-source file.
          }
        }

        continue;
      }

      try {
        files[filePath] = await fs.readFile(filePath, 'utf-8');
      } catch {
        if (typeof entry === 'string') {
          await visit(filePath);
        }
      }
    }
  }

  await visit(root);

  return files;
}

export async function assertGeneratedSourcesValid(fs: GeneratedFs): Promise<Record<string, string>> {
  const files = await collectGeneratedSources(fs);
  const diagnostics = validateGeneratedSources(files);

  if (diagnostics.length > 0) {
    throw new GeneratedCodeValidationError(diagnostics);
  }

  return files;
}

function compactPreviewError(content: string): string {
  const withoutAnsi = content.replace(/\u001b\[[0-9;]*m/g, '');
  let message: string;

  try {
    const parsed = JSON.parse(withoutAnsi) as { message?: string; error?: string };
    message = parsed.message || parsed.error || withoutAnsi;
  } catch {
    message = withoutAnsi
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  return message.slice(0, 6_000);
}

function isBrowserSourcePath(filePath: string): boolean {
  const normalized = filePath.replace(/^\.?\//, '');
  return (
    normalized.startsWith('src/') ||
    normalized.startsWith('app/') ||
    /^(?:App|main|index)\.[cm]?[jt]sx?$/.test(normalized)
  );
}

/*
 * Network-level failures reaching the WebContainer preview origin (cross-origin fetch races,
 * module-graph warm-up, dev-server restarts). These are NOT compile errors: sending them to the
 * model repair loop burned the whole repair budget and made the model recreate healthy projects.
 */
const TRANSIENT_PREVIEW_ERROR_PATTERN =
  /failed to fetch|networkerror|network error|load failed|fetch failed|econnrefused|econnreset|socket hang up|timed? ?out|temporarily unavailable|aborted|http 50[234]/i;

export function isTransientPreviewErrorMessage(message: string): boolean {
  return TRANSIENT_PREVIEW_ERROR_PATTERN.test(message);
}

/**
 * True when an error only reflects transient preview/network flakiness — every diagnostic (or the
 * bare message) matches the transient pattern and none is a real syntax/structure/compile error.
 */
export function isTransientPreviewError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const diagnostics = (error as Partial<GeneratedCodeValidationError>).diagnostics;

  if (Array.isArray(diagnostics) && diagnostics.length > 0) {
    return diagnostics.every(
      (diagnostic) => diagnostic.source === 'preview' && isTransientPreviewErrorMessage(diagnostic.message),
    );
  }

  return isTransientPreviewErrorMessage(error.message);
}

export type ViteTransformVerifyOptions = {
  maxAttempts?: number;
  retryDelayMs?: number;
};

/**
 * Fetch each generated browser source through Vite's transform pipeline. Failures are retried
 * with backoff; only PERSISTENT real compile errors throw. Persistent transient network failures
 * fail open — the preview iframe already loaded, and e.g. cross-origin fetch restrictions must
 * not trigger a model repair turn against a healthy app.
 */
export async function verifyViteSourceTransforms(
  baseUrl: string,
  sourcePaths: string[],
  fetcher: typeof fetch = fetch,
  options: ViteTransformVerifyOptions = {},
): Promise<void> {
  const maxAttempts = options.maxAttempts ?? 3;
  const retryDelayMs = options.retryDelayMs ?? 1500;
  let pending = sourcePaths.filter(isBrowserSourcePath);
  let diagnostics: GeneratedCodeDiagnostic[] = [];

  for (let attempt = 1; attempt <= maxAttempts && pending.length > 0; attempt++) {
    if (attempt > 1) {
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs * (attempt - 1)));
    }

    const attemptDiagnostics: GeneratedCodeDiagnostic[] = [];
    const stillFailing: string[] = [];

    await Promise.all(
      pending.map(async (filePath) => {
        const url = new URL(filePath.replace(/^\/+/, ''), `${baseUrl.replace(/\/+$/, '')}/`);
        url.searchParams.set('indobase-health', Date.now().toString());

        try {
          const response = await fetcher(url);

          if (!response.ok) {
            attemptDiagnostics.push({
              filePath,
              message: compactPreviewError(await response.text()) || `Vite transform returned HTTP ${response.status}.`,
              source: 'preview',
            });
            stillFailing.push(filePath);
          }
        } catch (error) {
          attemptDiagnostics.push({
            filePath,
            message: error instanceof Error ? error.message : String(error),
            source: 'preview',
          });
          stillFailing.push(filePath);
        }
      }),
    );

    diagnostics = attemptDiagnostics;
    pending = stillFailing;
  }

  const realDiagnostics = diagnostics.filter((diagnostic) => !isTransientPreviewErrorMessage(diagnostic.message));

  if (realDiagnostics.length > 0) {
    throw new GeneratedCodeValidationError(realDiagnostics, 'Vite preview compile failed');
  }
}
