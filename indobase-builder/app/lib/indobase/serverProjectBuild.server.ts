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
import { buildHostedBuildChildEnv } from '~/lib/indobase/hosted-build-env.server';
import { withHostedBuildSlot } from '~/lib/indobase/hosted-build-queue.server';
import { normalizeProjectFilesRoot } from '~/lib/indobase/normalize-project-files';
import { createScopedLogger } from '~/utils/logger';

const execFileAsync = promisify(execFile);
const logger = createScopedLogger('server-project-build');

const BUILD_TIMEOUT_MS = 180_000;
const INSTALL_TIMEOUT_MS = 120_000;

function packageBuildLooksLikeVite(packageJson: string): boolean {
  try {
    const scripts = (JSON.parse(packageJson) as { scripts?: Record<string, string> }).scripts ?? {};
    return /\bvite\b/.test(scripts.build || '') || /\bvite\b/.test(scripts.dev || '');
  } catch {
    return false;
  }
}

async function resolveNpmBinary(): Promise<string> {
  const candidates = ['/usr/local/bin/npm', '/usr/bin/npm', '/bin/npm'];

  for (const candidate of candidates) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // try next
    }
  }

  return 'npm';
}

function npmCacheDir(): string {
  return path.join(os.tmpdir(), 'indobase-hosted-npm-cache');
}

function buildChildEnv(workDir: string): NodeJS.ProcessEnv {
  return buildHostedBuildChildEnv({
    workDir,
    npmCacheDir: npmCacheDir(),
    tmpDir: workDir,
  });
}

const MAX_BUILD_LOG_CHARS = 6_000;

/** Prefer real compiler output over Node's opaque "Command failed: …" message. */
export function formatServerBuildExecError(error: unknown, fallback = 'Server build failed'): string {
  if (!error || typeof error !== 'object') {
    return typeof error === 'string' && error.trim() ? error : fallback;
  }

  const execError = error as {
    message?: string;
    stdout?: string | Buffer;
    stderr?: string | Buffer;
  };
  const stderr = String(execError.stderr ?? '').trim();
  const stdout = String(execError.stdout ?? '').trim();
  const log = [stderr, stdout].filter(Boolean).join('\n\n').trim();

  if (log) {
    const clipped = log.length > MAX_BUILD_LOG_CHARS ? log.slice(-MAX_BUILD_LOG_CHARS) : log;
    return `Server build failed:\n${clipped}`;
  }

  return execError.message?.trim() || fallback;
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
  return withHostedBuildSlot(() => runServerProjectBuild(projectFiles, env, options));
}

async function runServerProjectBuild(
  projectFiles: Record<string, string>,
  env: Record<string, string>,
  options: { assetBase?: string },
): Promise<CollectBuildArtifactsResult> {
  const normalized = normalizeProjectFilesRoot(projectFiles).files;

  if (!normalized['package.json']) {
    return {
      success: false,
      error: 'Missing package.json — cannot run server build.',
    };
  }

  await fs.mkdir(npmCacheDir(), { recursive: true }).catch(() => undefined);

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

    // Only public Vite client vars — never hand Builder/Studio secrets to the build tree.
    const publicEnvEntries = Object.entries(env).filter(
      ([key]) => key.startsWith('VITE_') || key.startsWith('NEXT_PUBLIC_') || key.startsWith('PUBLIC_'),
    );
    const envFile = publicEnvEntries.map(([key, value]) => `${key}=${value}`).join('\n');

    if (envFile) {
      await fs.writeFile(path.join(workDir, '.env'), envFile, 'utf8');
    }

    const childEnv = buildChildEnv(workDir);
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
    const message = formatServerBuildExecError(error);
    logger.error('Server project build failed', message);

    return {
      success: false,
      error: message,
    };
  } finally {
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  }
}
