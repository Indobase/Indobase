import { webcontainer } from '~/lib/webcontainer';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('ensure-npm-deps');

const INSTALL_ARGS = ['install', '--no-audit', '--no-fund', '--prefer-offline', '--yes'] as const;

async function hasPackageJson(): Promise<boolean> {
  try {
    const container = await webcontainer;
    await container.fs.readFile('package.json', 'utf-8');
    return true;
  } catch {
    return false;
  }
}

async function nodeModulesReady(): Promise<boolean> {
  const container = await webcontainer;

  try {
    const entries = await container.fs.readdir('node_modules', { withFileTypes: true });

    if (entries.length === 0) {
      return false;
    }
  } catch {
    return false;
  }

  try {
    await container.fs.readFile('node_modules/vite/package.json', 'utf-8');
    return true;
  } catch {
    try {
      await container.fs.readFile('node_modules/typescript/package.json', 'utf-8');
      return true;
    } catch {
      return entriesHasBin(container);
    }
  }
}

async function entriesHasBin(container: Awaited<typeof webcontainer>): Promise<boolean> {
  try {
    const binEntries = await container.fs.readdir('node_modules/.bin', { withFileTypes: true });
    return binEntries.length > 0;
  } catch {
    return false;
  }
}

export type EnsureNpmDependenciesResult = {
  error?: string;
  output?: string;
  success: boolean;
};

export async function ensureNpmDependencies(): Promise<EnsureNpmDependenciesResult> {
  if (!(await hasPackageJson())) {
    return { success: true };
  }

  if (await nodeModulesReady()) {
    return { success: true };
  }

  const container = await webcontainer;
  logger.info('Running npm install in WebContainer (dependencies missing)');

  const installProcess = await container.spawn('npm', [...INSTALL_ARGS]);
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

  return { success: true, output };
}
