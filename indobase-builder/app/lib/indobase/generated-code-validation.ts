import { parse } from '@babel/parser';

export type GeneratedCodeDiagnostic = {
  filePath: string;
  message: string;
  line?: number;
  column?: number;
  source: 'syntax' | 'preview';
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

export async function verifyViteSourceTransforms(
  baseUrl: string,
  sourcePaths: string[],
  fetcher: typeof fetch = fetch,
): Promise<void> {
  const diagnostics: GeneratedCodeDiagnostic[] = [];

  await Promise.all(
    sourcePaths.filter(isBrowserSourcePath).map(async (filePath) => {
      const url = new URL(filePath.replace(/^\/+/, ''), `${baseUrl.replace(/\/+$/, '')}/`);
      url.searchParams.set('indobase-health', Date.now().toString());

      try {
        const response = await fetcher(url);

        if (!response.ok) {
          diagnostics.push({
            filePath,
            message: compactPreviewError(await response.text()) || `Vite transform returned HTTP ${response.status}.`,
            source: 'preview',
          });
        }
      } catch (error) {
        diagnostics.push({
          filePath,
          message: error instanceof Error ? error.message : String(error),
          source: 'preview',
        });
      }
    }),
  );

  if (diagnostics.length > 0) {
    throw new GeneratedCodeValidationError(diagnostics, 'Vite preview compile failed');
  }
}
