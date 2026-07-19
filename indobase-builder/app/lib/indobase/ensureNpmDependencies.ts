import type { WebContainer } from '@webcontainer/api';
import { getWebcontainerWithRetry } from '~/lib/webcontainer';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('ensure-npm-deps');

const INSTALL_ARGS = ['install', '--no-audit', '--no-fund', '--prefer-offline', '--yes', '--include=dev'] as const;

const TOOLCHAIN_BINS = ['vite', 'tsc', 'next', 'webpack'] as const;

type ContainerFs = Pick<WebContainer, 'fs' | 'spawn'>;

async function resolveContainer(container?: ContainerFs): Promise<ContainerFs> {
  if (container) {
    return container;
  }

  return getWebcontainerWithRetry(2);
}

async function hasPackageJson(container: ContainerFs): Promise<boolean> {
  try {
    await container.fs.readFile('package.json', 'utf-8');
    return true;
  } catch {
    return false;
  }
}

/**
 * True when node_modules/.bin contains a real toolchain binary (e.g. vite).
 * A non-empty node_modules alone is not enough — incomplete installs still fail
 * with `sh: command not found: vite`.
 */
export async function isToolchainReady(container?: ContainerFs): Promise<boolean> {
  const wc = await resolveContainer(container);

  try {
    const binEntries = await wc.fs.readdir('node_modules/.bin', { withFileTypes: true });

    if (binEntries.length === 0) {
      return false;
    }

    const binNames = new Set(binEntries.map((entry) => (typeof entry === 'string' ? entry : entry.name)));

    return TOOLCHAIN_BINS.some((bin) => binNames.has(bin));
  } catch {
    return false;
  }
}

/** Shell/start commands that need node_modules/.bin before they can succeed. */
export function isDevStartCommand(command: string): boolean {
  const trimmed = command.trim();

  return (
    /\b(?:npm|pnpm|yarn)\s+run\s+(?:dev|start|preview)\b/.test(trimmed) ||
    /^\s*(?:npx\s+)?vite(?:\s|$)/.test(trimmed)
  );
}

export type EnsureNpmDependenciesResult = {
  error?: string;
  output?: string;
  success: boolean;
};

/**
 * Ensure package.json projects have an installed toolchain before start/build.
 * Pass the ActionRunner WebContainer when available so tests and the shell share state.
 */
export async function ensureNpmDependencies(container?: ContainerFs): Promise<EnsureNpmDependenciesResult> {
  const wc = await resolveContainer(container);

  if (!(await hasPackageJson(wc))) {
    return { success: true };
  }

  if (await isToolchainReady(wc)) {
    return { success: true };
  }

  logger.info('Running npm install in WebContainer (toolchain binary missing)');

  const installProcess = await wc.spawn('npm', [...INSTALL_ARGS]);
  let output = '';

  const outputPromise = installProcess.output.pipeTo(
    new WritableStream({
      write(data) {
        output += data;
      },
    }),
  );

  const exitCode = await installProcess.exit;
  await outputPromise.catch(() => undefined);

  if (exitCode !== 0) {
    return {
      success: false,
      output,
      error: output.trim() || `npm install failed (exit ${exitCode})`,
    };
  }

  if (!(await isToolchainReady(wc))) {
    return {
      success: false,
      output,
      error:
        'npm install finished but node_modules/.bin/vite (or another toolchain binary) is still missing. Check package.json devDependencies and re-run install with --include=dev.',
    };
  }

  return { success: true, output };
}
