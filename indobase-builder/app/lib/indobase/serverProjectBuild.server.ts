import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import type { CollectBuildArtifactsResult } from '~/lib/indobase/collectBuildArtifacts';
import { createScopedLogger } from '~/utils/logger';

const execFileAsync = promisify(execFile);
const logger = createScopedLogger('server-project-build');

const BUILD_TIMEOUT_MS = 180_000;
const INSTALL_TIMEOUT_MS = 120_000;

async function readDistArtifacts(distDir: string, root = distDir): Promise<Record<string, string>> {
  const files: Record<string, string> = {};
  const entries = await fs.readdir(distDir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(distDir, entry.name);

    if (entry.isFile()) {
      const relative = path.relative(root, fullPath).replace(/\\/g, '/');

      try {
        files[relative] = await fs.readFile(fullPath, 'utf8');
      } catch {
        continue;
      }
    } else if (entry.isDirectory()) {
      Object.assign(files, await readDistArtifacts(fullPath, root));
    }
  }

  return files;
}

export async function buildProjectArtifactsOnServer(
  projectFiles: Record<string, string>,
  env: Record<string, string>,
): Promise<CollectBuildArtifactsResult> {
  if (!projectFiles['package.json']) {
    return {
      success: false,
      error: 'Missing package.json — cannot run server build.',
    };
  }

  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'indobase-builder-'));

  try {
    for (const [relativePath, content] of Object.entries(projectFiles)) {
      if (!relativePath || relativePath.includes('..')) {
        continue;
      }

      const dest = path.join(workDir, relativePath);
      await fs.mkdir(path.dirname(dest), { recursive: true });
      await fs.writeFile(dest, content, 'utf8');
    }

    const envFile = Object.entries(env)
      .map(([key, value]) => `${key}=${value}`)
      .join('\n');

    if (envFile) {
      await fs.writeFile(path.join(workDir, '.env'), envFile, 'utf8');
    }

    const childEnv = {
      ...process.env,
      ...env,
      CI: 'true',
      // Builder runs with NODE_ENV=production; Vite templates need devDependencies (vite, typescript, @types/*).
      NODE_ENV: 'development',
    };

    logger.info(`Server build: npm install in ${workDir}`);
    await execFileAsync(
      'npm',
      ['install', '--no-audit', '--no-fund', '--prefer-offline', '--include=dev'], {
      cwd: workDir,
      timeout: INSTALL_TIMEOUT_MS,
      env: childEnv,
      maxBuffer: 10 * 1024 * 1024,
    });

    logger.info(`Server build: npm run build in ${workDir}`);
    await execFileAsync('npm', ['run', 'build'], {
      cwd: workDir,
      timeout: BUILD_TIMEOUT_MS,
      env: childEnv,
      maxBuffer: 10 * 1024 * 1024,
    });

    const distDir = path.join(workDir, 'dist');
    const files = await readDistArtifacts(distDir);

    if (!files['index.html']) {
      return {
        success: false,
        error: 'Server build completed but dist/index.html is missing.',
      };
    }

    return { success: true, files };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('Server project build failed', error);

    return {
      success: false,
      error: message,
    };
  } finally {
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  }
}
