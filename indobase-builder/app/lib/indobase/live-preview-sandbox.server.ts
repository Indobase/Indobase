/**
 * Hosted preview build execution (StackBlitz replacement for deployed Builder).
 *
 * Not a strong OS sandbox — isolated tmp workdir + scrubbed child env + build queue.
 * Builds LLM-generated apps on the Builder host, serves dist at `/sandbox-preview/:id/`.
 *
 * Prefer "hosted build execution" in platform docs; URL path kept for stability.
 */

import { execFile, type ChildProcess } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import {
  ensureIndexHtmlInArtifacts,
  findFirstExistingBuildOutputDir,
} from '~/lib/indobase/buildOutputDirs';
import { buildHostedBuildChildEnv } from '~/lib/indobase/hosted-build-env.server';
import { withHostedBuildSlot } from '~/lib/indobase/hosted-build-queue.server';
import { formatServerBuildExecError } from '~/lib/indobase/serverProjectBuild.server';
import { normalizeProjectFilesRoot } from '~/lib/indobase/normalize-project-files';
import { createScopedLogger } from '~/utils/logger';

const execFileAsync = promisify(execFile);
const logger = createScopedLogger('hosted-preview-build');

const SANDBOX_TTL_MS = 45 * 60 * 1000;
const MAX_SANDBOXES = 8;
const INSTALL_TIMEOUT_MS = 120_000;
const BUILD_TIMEOUT_MS = 180_000;
const VITE_READY_TIMEOUT_MS = 45_000;

export type SandboxPreviewRecord = {
  id: string;
  snapshotId?: string;
  createdAt: number;
  expiresAt: number;
  workDir: string;
  distDir: string;
  files: Record<string, string>;
  port?: number;
  child?: ChildProcess;
};

const sandboxes = new Map<string, SandboxPreviewRecord>();

function npmCacheDir(): string {
  return path.join(os.tmpdir(), 'indobase-hosted-npm-cache');
}

async function resolveNpmBinary(): Promise<string> {
  for (const candidate of ['/usr/local/bin/npm', '/usr/bin/npm', '/bin/npm']) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // next
    }
  }

  return 'npm';
}

function childEnvForWorkdir(workDir: string): NodeJS.ProcessEnv {
  return buildHostedBuildChildEnv({
    workDir,
    npmCacheDir: npmCacheDir(),
    tmpDir: workDir,
  });
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

async function destroySandbox(id: string) {
  const record = sandboxes.get(id);

  if (!record) {
    return;
  }

  sandboxes.delete(id);

  try {
    record.child?.kill('SIGTERM');
  } catch {
    // ignore
  }

  setTimeout(() => {
    try {
      record.child?.kill('SIGKILL');
    } catch {
      // ignore
    }
  }, 3_000);

  await fs.rm(record.workDir, { recursive: true, force: true }).catch(() => undefined);
  logger.info(`Destroyed hosted preview ${id}`);
}

function pruneSandboxes(now = Date.now()) {
  for (const [id, record] of sandboxes) {
    if (record.expiresAt <= now) {
      void destroySandbox(id);
    }
  }

  if (sandboxes.size <= MAX_SANDBOXES) {
    return;
  }

  const oldest = [...sandboxes.values()].sort((a, b) => a.createdAt - b.createdAt);

  while (sandboxes.size > MAX_SANDBOXES && oldest.length > 0) {
    const drop = oldest.shift();

    if (drop) {
      void destroySandbox(drop.id);
    }
  }
}

async function allocatePort(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, '127.0.0.1', () => {
      const address = server.address() as AddressInfo | null;
      const port = address?.port;

      server.close((error) => {
        if (error || !port) {
          reject(error || new Error('Failed to allocate preview port'));
          return;
        }

        resolve(port);
      });
    });
    server.on('error', reject);
  });
}

async function waitForLocalHttp(port: number, timeoutMs: number): Promise<boolean> {
  const started = Date.now();

  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/`, {
        method: 'GET',
        signal: AbortSignal.timeout(2_000),
      });

      if (response.status >= 200 && response.status < 500) {
        return true;
      }
    } catch {
      // retry
    }

    await new Promise((r) => setTimeout(r, 400));
  }

  return false;
}

async function tryStartVitePreview(
  workDir: string,
  distDir: string,
): Promise<{ port: number; child: ChildProcess } | null> {
  const enableVite =
    (globalThis as { process?: { env?: { BUILDER_SANDBOX_VITE?: string } } }).process?.env
      ?.BUILDER_SANDBOX_VITE === 'true';

  if (!enableVite) {
    return null;
  }

  try {
    await fs.access(path.join(workDir, 'node_modules', 'vite'));
  } catch {
    logger.info('Hosted preview: vite not installed — static dist only');
    return null;
  }

  const port = await allocatePort();
  const npmBin = await resolveNpmBinary();
  const childEnv = childEnvForWorkdir(workDir);

  const child = execFile(
    npmBin,
    ['exec', '--', 'vite', 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'],
    {
      cwd: workDir,
      env: childEnv,
      maxBuffer: 2 * 1024 * 1024,
    },
  );

  child.stderr?.on('data', (chunk: Buffer) => {
    const text = chunk.toString('utf8').trim();

    if (text) {
      logger.info(`hosted vite[${port}]: ${text.slice(0, 400)}`);
    }
  });

  const ready = await waitForLocalHttp(port, VITE_READY_TIMEOUT_MS);

  if (!ready) {
    try {
      child.kill('SIGTERM');
    } catch {
      // ignore
    }

    logger.warn(`Hosted vite preview on ${port} did not become ready — static dist from ${distDir}`);
    return null;
  }

  return { port, child };
}

export type StartSandboxResult =
  | { success: true; id: string; expiresAt: number; hasViteProxy: boolean; snapshotId?: string }
  | { success: false; error: string };

export type StartSandboxOptions = {
  snapshotId?: string;
};

/**
 * Build frozen project sources on the host and register a preview session.
 * Runs under the global hosted-build queue (default concurrency 2).
 */
export async function startSandboxPreview(
  projectFiles: Record<string, string>,
  options: StartSandboxOptions = {},
): Promise<StartSandboxResult> {
  return withHostedBuildSlot(() => runHostedPreviewBuild(projectFiles, options));
}

async function runHostedPreviewBuild(
  projectFiles: Record<string, string>,
  options: StartSandboxOptions,
): Promise<StartSandboxResult> {
  pruneSandboxes();

  const normalized = normalizeProjectFilesRoot(projectFiles).files;

  if (!normalized['package.json']) {
    return { success: false, error: 'Missing package.json — cannot start hosted preview build.' };
  }

  await fs.mkdir(npmCacheDir(), { recursive: true }).catch(() => undefined);

  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'indobase-hosted-'));
  const id = randomBytes(12).toString('hex');

  try {
    for (const [relativePath, content] of Object.entries(normalized)) {
      if (!relativePath || relativePath.includes('..') || typeof content !== 'string') {
        continue;
      }

      const dest = path.join(workDir, relativePath);
      await fs.mkdir(path.dirname(dest), { recursive: true });
      await fs.writeFile(dest, content, 'utf8');
    }

    // Do not write client-supplied secrets into the workdir. Public Vite vars can be added later
    // via an explicit allowlist if product needs them.

    const childEnv = childEnvForWorkdir(workDir);
    const npmBin = await resolveNpmBinary();

    logger.info(
      `Hosted preview ${id}: npm install (snapshot=${options.snapshotId ?? 'none'}) in ${workDir}`,
    );
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

    logger.info(`Hosted preview ${id}: npm run build -- --base ./`);
    await execFileAsync(npmBin, ['run', 'build', '--', '--base', './'], {
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
      await fs.rm(workDir, { recursive: true, force: true }).catch(() => undefined);
      return {
        success: false,
        error: 'Hosted build completed but no output directory (dist, build, out) was found.',
      };
    }

    const distDir = path.join(workDir, outputDirName);
    let files = await readDistArtifacts(distDir);
    files = await ensureIndexHtmlInArtifacts(files, async (candidate) => {
      try {
        return await fs.readFile(path.join(distDir, candidate), 'utf8');
      } catch {
        return null;
      }
    });

    if (!files['index.html']) {
      await fs.rm(workDir, { recursive: true, force: true }).catch(() => undefined);
      return { success: false, error: `Hosted build missing ${outputDirName}/index.html.` };
    }

    const vite = await tryStartVitePreview(workDir, distDir);
    const now = Date.now();
    const record: SandboxPreviewRecord = {
      id,
      snapshotId: options.snapshotId,
      createdAt: now,
      expiresAt: now + SANDBOX_TTL_MS,
      workDir,
      distDir,
      files,
      port: vite?.port,
      child: vite?.child,
    };

    sandboxes.set(id, record);
    pruneSandboxes();

    if (vite?.child) {
      vite.child.on('exit', () => {
        const current = sandboxes.get(id);

        if (current) {
          current.port = undefined;
          current.child = undefined;
        }
      });
    }

    logger.info(
      `Hosted preview ${id} ready (files=${Object.keys(files).length}, vite=${Boolean(vite?.port)})`,
    );

    return {
      success: true,
      id,
      expiresAt: record.expiresAt,
      hasViteProxy: Boolean(vite?.port),
      snapshotId: options.snapshotId,
    };
  } catch (error) {
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => undefined);
    const message = formatServerBuildExecError(error, 'Hosted preview build failed');
    logger.error(`Hosted preview ${id} failed`, message);

    return { success: false, error: message };
  }
}

export function getSandboxPreview(id: string): SandboxPreviewRecord | undefined {
  pruneSandboxes();

  const record = sandboxes.get(id);

  if (!record) {
    return undefined;
  }

  if (record.expiresAt <= Date.now()) {
    void destroySandbox(id);
    return undefined;
  }

  return record;
}

function guessContentType(filePath: string) {
  const lower = filePath.toLowerCase();

  if (lower.endsWith('.html')) return 'text/html; charset=utf-8';
  if (lower.endsWith('.css')) return 'text/css; charset=utf-8';
  if (lower.endsWith('.js') || lower.endsWith('.mjs')) return 'text/javascript; charset=utf-8';
  if (lower.endsWith('.json')) return 'application/json; charset=utf-8';
  if (lower.endsWith('.svg')) return 'image/svg+xml';
  if (lower.endsWith('.map')) return 'application/json; charset=utf-8';
  if (lower.endsWith('.txt')) return 'text/plain; charset=utf-8';
  if (lower.endsWith('.ico')) return 'image/x-icon';
  if (lower.endsWith('.woff2')) return 'font/woff2';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.webp')) return 'image/webp';

  return 'application/octet-stream';
}

function rewriteRootAbsoluteUrls(content: string, sandboxBase: string): string {
  const base = sandboxBase.replace(/\/+$/, '');

  return content
    .replace(/(\b(?:src|href|poster)=["'])\/(?!\/)/gi, `$1${base}/`)
    .replace(/(url\(\s*['"]?)\/(?!\/)/gi, `$1${base}/`);
}

export async function resolveSandboxPreviewResponse(
  id: string,
  requestPath: string,
): Promise<Response | null> {
  const record = getSandboxPreview(id);

  if (!record) {
    return null;
  }

  let relative = requestPath.replace(/^\/+/, '');

  if (!relative || relative.endsWith('/')) {
    relative = `${relative}index.html`.replace(/^\/+/, '');
  }

  if (relative.includes('..')) {
    return null;
  }

  if (record.port) {
    try {
      const upstream = await fetch(`http://127.0.0.1:${record.port}/${relative}`, {
        method: 'GET',
        signal: AbortSignal.timeout(10_000),
      });

      if (upstream.ok || upstream.status === 304) {
        const buffer = await upstream.arrayBuffer();
        const contentType = upstream.headers.get('content-type') || guessContentType(relative);

        return new Response(buffer, {
          status: upstream.status,
          headers: {
            'Content-Type': contentType,
            'Cache-Control': 'no-store',
            'Content-Security-Policy': "frame-ancestors 'self'",
            'X-Content-Type-Options': 'nosniff',
            'X-Indobase-Preview': 'hosted-vite',
            ...(record.snapshotId ? { 'X-Indobase-Snapshot': record.snapshotId } : {}),
          },
        });
      }
    } catch (error) {
      logger.warn(`Hosted preview ${id} vite proxy failed for /${relative}`, error);
    }
  }

  const raw =
    record.files[relative] ??
    (relative === '' || relative === 'index.html' ? record.files['index.html'] : undefined);

  if (raw == null) {
    return null;
  }

  const sandboxBase = `/sandbox-preview/${id}`;
  const lower = relative.toLowerCase();
  const content =
    lower.endsWith('.html') || lower.endsWith('.css') || lower.endsWith('.js') || lower.endsWith('.mjs')
      ? rewriteRootAbsoluteUrls(raw, sandboxBase)
      : raw;

  return new Response(content, {
    status: 200,
    headers: {
      'Content-Type': guessContentType(relative),
      'Cache-Control': 'no-store',
      'Content-Security-Policy': "frame-ancestors 'self'",
      'X-Content-Type-Options': 'nosniff',
      'X-Indobase-Preview': 'hosted-static',
      ...(record.snapshotId ? { 'X-Indobase-Snapshot': record.snapshotId } : {}),
    },
  });
}

export function sandboxPreviewPublicUrl(id: string, requestOrigin?: string): string {
  const previewPath = `/sandbox-preview/${id}/`;

  if (!requestOrigin) {
    return previewPath;
  }

  return `${requestOrigin.replace(/\/+$/, '')}${previewPath}`;
}
