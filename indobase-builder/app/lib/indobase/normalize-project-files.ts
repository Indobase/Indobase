/**
 * Models sometimes scaffold under a nested folder (`my-app/package.json`) instead of the
 * workbench root. Draft preview + server build require a root `package.json` — detect the
 * real project root and optionally flatten paths so validation and npm install succeed.
 */

export type NormalizeProjectFilesResult = {
  /** Relative paths suitable for contract validation and server build. */
  files: Record<string, string>;
  /** Prefix that was stripped (e.g. `my-app/`), or empty when already root-level. */
  rootPrefix: string;
  flattened: boolean;
};

const PACKAGE_JSON = 'package.json';
const MAX_NEST_DEPTH = 3;

function packageJsonLooksRunnable(content: string): boolean {
  try {
    const scripts = (JSON.parse(content) as { scripts?: Record<string, string> }).scripts ?? {};

    return Boolean(scripts.build || scripts.dev || scripts.start);
  } catch {
    return /"(?:build|dev|start)"\s*:/.test(content);
  }
}

/** All package.json paths, shallowest first (excluding node_modules). */
export function listPackageJsonPaths(files: Record<string, string>): string[] {
  return Object.keys(files)
    .filter(
      (path) =>
        (path === PACKAGE_JSON || path.endsWith(`/${PACKAGE_JSON}`)) &&
        !path.split('/').includes('node_modules'),
    )
    .sort((a, b) => {
      const depthDiff = a.split('/').length - b.split('/').length;

      if (depthDiff !== 0) {
        return depthDiff;
      }

      return a.length - b.length;
    });
}

/**
 * Directory prefix containing the project package.json (with trailing slash), or `''` for root.
 */
export function detectProjectRootPrefix(files: Record<string, string>): string {
  const packagePaths = listPackageJsonPaths(files);

  if (packagePaths.includes(PACKAGE_JSON)) {
    return '';
  }

  if (packagePaths.length === 0) {
    return '';
  }

  const candidates = packagePaths.filter((path) => {
    const depth = path.split('/').length - 1;

    return depth >= 1 && depth <= MAX_NEST_DEPTH;
  });

  if (candidates.length === 0) {
    return '';
  }

  const runnable = candidates.find((path) => packageJsonLooksRunnable(files[path] ?? ''));
  const chosen = runnable ?? candidates[0];
  const dir = chosen.slice(0, -PACKAGE_JSON.length);

  return dir.endsWith('/') ? dir : `${dir}/`;
}

/**
 * If package.json only exists under a nested folder, rewrite paths relative to that folder.
 * Root-level package.json is left unchanged. Files outside the nested root are kept as-is
 * when they do not collide with flattened names.
 */
export function normalizeProjectFilesRoot(files: Record<string, string>): NormalizeProjectFilesResult {
  const rootPrefix = detectProjectRootPrefix(files);

  if (!rootPrefix) {
    return { files: { ...files }, rootPrefix: '', flattened: false };
  }

  const flattened: Record<string, string> = {};

  for (const [path, content] of Object.entries(files)) {
    if (path.startsWith(rootPrefix)) {
      const relative = path.slice(rootPrefix.length);

      if (relative) {
        flattened[relative] = content;
      }
    }
  }

  // Preserve non-nested siblings that don't collide (e.g. root README).
  for (const [path, content] of Object.entries(files)) {
    if (!path.startsWith(rootPrefix) && flattened[path] === undefined) {
      flattened[path] = content;
    }
  }

  return {
    files: flattened,
    rootPrefix,
    flattened: true,
  };
}

export function hasRunnablePackageJson(files: Record<string, string>): boolean {
  const normalized = normalizeProjectFilesRoot(files).files;
  const packageJson = normalized[PACKAGE_JSON];

  return Boolean(packageJson && packageJsonLooksRunnable(packageJson));
}
