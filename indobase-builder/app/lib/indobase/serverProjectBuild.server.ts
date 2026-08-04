import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import type { CollectBuildArtifactsResult } from '~/lib/indobase/collectBuildArtifacts';
import {
  ensureIndexHtmlInArtifacts,
  findFirstExistingBuildOutputDir,
} from '~/lib/indobase/buildOutputDirs';
import { normalizeProjectFilesRoot } from '~/lib/indobase/normalize-project-files';
import { createScopedLogger } from '~/utils/logger';

const execFileAsync = promisify(execFile);
const logger = createScopedLogger('server-project-build');

const BUILD_TIMEOUT_MS = 180_000;
const INSTALL_TIMEOUT_MS = 120_000;

/** Standard PATH for Node Docker images — deploy env must never strip this. */
const SAFE_PATH = ['/usr/local/bin', '/usr/bin', '/bin'].join(path.delimiter);

function packageBuildLooksLikeVite(packageJson: string): boolean {
  try {
    const scripts = (JSON.parse(packageJson) as { scripts?: Record<string, string> }).scripts ?? {};
    return /\bvite\b/.test(scripts.build || '') || /\bvite\b/.test(scripts.dev || '');
  } catch {
    return false;
  }
}

async function resolveNpmBinary(): Promise<string> {
  const candidates = [
    path.join(path.dirname(process.execPath), 'npm'),
    '/usr/local/bin/npm',
    '/usr/bin/npm',
  ];

  for (const candidate of candidates) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // try next
    }
  }

  // Last resort: rely on PATH lookup (may still fail — caller surfaces ENOENT).
  return 'npm';
}

function buildChildEnv(env: Record<string, string>): NodeJS.ProcessEnv {
  const basePath = typeof process.env.PATH === 'string' && process.env.PATH.trim() ? process.env.PATH : SAFE_PATH;

  // Do not let deploy/project env override PATH or strip Node binaries.
  const { PATH: _ignoredPath, path: _ignoredPathLower, ...safeProjectEnv } = env;

  return {
    ...process.env,
    ...safeProjectEnv,
    PATH: basePath.includes('/usr/local/bin') ? basePath : `${SAFE_PATH}${path.delimiter}${basePath}`,
    CI: 'true',
    // Builder runs with NODE_ENV=production; Vite templates need devDependencies.
    NODE_ENV: 'development',
  };
}

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
  options: { assetBase?: string } = {},
): Promise<CollectBuildArtifactsResult> {
  const normalized = normalizeProjectFilesRoot(projectFiles).files;

  if (!normalized['package.json']) {
    return {
      success: false,
      error: 'Missing package.json — cannot run server build.',
    };
  }

  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'indobase-builder-'));

  try {
    for (const [relativePath, content] of Object.entries(normalized)) {
      if (typeof relativePath !== 'string' || !relativePath || relativePath.includes('..')) {
        continue;
      }

      if (typeof content !== 'string') {
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

    const childEnv = buildChildEnv(env);
    const npmBin = await resolveNpmBinary();

    logger.info(`Server build: ${npmBin} install in ${workDir}`);
    await execFileAsync(
      npmBin,
      ['install', '--no-audit', '--no-fund', '--prefer-offline', '--include=dev'],
      {
        cwd: workDir,
        timeout: INSTALL_TIMEOUT_MS,
        env: childEnv,
        maxBuffer: 10 * 1024 * 1024,
      },
    );

    const buildArgs = ['run', 'build'];

    /*
     * Draft previews are served under /draft-preview/:id/. Relative asset base keeps Vite
     * chunk URLs working without post-hoc path rewriting for every hashed file.
     */
    if (options.assetBase && packageBuildLooksLikeVite(normalized['package.json'])) {
      buildArgs.push('--', '--base', options.assetBase);
      logger.info(`Server build: using Vite --base ${options.assetBase}`);
    }

    logger.info(`Server build: ${npmBin} ${buildArgs.join(' ')} in ${workDir}`);
    await execFileAsync(npmBin, buildArgs, {
      cwd: workDir,
      timeout: BUILD_TIMEOUT_MS,
      env: childEnv,
      maxBuffer: 10 * 1024 * 1024,
    });

    const outputDirName = await findFirstExistingBuildOutputDir(async (dir) => {
      try {
        await fs.access(path.join(workDir, dir));
        return true;
      } catch {
        return false;
      }
    });

    if (!outputDirName) {
      return {
        success: false,
        error: 'Server build completed but no output directory (dist, build, out, etc.) was found.',
      };
    }

    const outputRoot = path.join(workDir, outputDirName);
    let files = await readDistArtifacts(outputRoot);

    files = await ensureIndexHtmlInArtifacts(files, async (candidate) => {
      try {
        return await fs.readFile(path.join(outputRoot, candidate), 'utf8');
      } catch {
        return null;
      }
    });

    if (!files['index.html']) {
      return {
        success: false,
        error: `Server build completed but ${outputDirName}/index.html is missing.`,
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
