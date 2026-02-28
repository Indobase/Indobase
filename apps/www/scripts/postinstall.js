/* eslint-disable */
import fs from 'node:fs';
import path from 'node:path';

function chmodIfExists(p) {
  try {
    if (fs.existsSync(p)) {
      fs.chmodSync(p, 0o755);
      console.log('[postinstall] chmod +x', p);
    }
  } catch (e) {
    console.warn('[postinstall] failed to chmod', p, e.message);
  }
}

function fixEsbuildPermissions() {
  const root = process.cwd();
  const nm = path.join(root, 'node_modules');
  const esbuildBin = path.join(nm, 'esbuild', 'bin', 'esbuild');
  chmodIfExists(esbuildBin);

  // Also try platform-specific esbuild packages
  try {
    const entries = fs.readdirSync(nm, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && entry.name.startsWith('esbuild-')) {
        const p = path.join(nm, entry.name, 'bin', 'esbuild');
        chmodIfExists(p);
      }
    }
  } catch (e) {
    console.warn('[postinstall] scan esbuild-* failed', e.message);
  }

  // pnpm layout: node_modules/.pnpm/esbuild@x.y.z/node_modules/esbuild/bin/esbuild
  try {
    const pnpmDir = path.join(nm, '.pnpm');
    if (fs.existsSync(pnpmDir)) {
      const pkgs = fs.readdirSync(pnpmDir, { withFileTypes: true });
      for (const pkg of pkgs) {
        if (!pkg.isDirectory()) continue;
        const pkgRoot = path.join(pnpmDir, pkg.name, 'node_modules');
        const pnpmEsbuild = path.join(pkgRoot, 'esbuild', 'bin', 'esbuild');
        chmodIfExists(pnpmEsbuild);
        // platform-specific esbuild-* packages inside pnpm layout
        try {
          const sub = fs.readdirSync(pkgRoot, { withFileTypes: true });
          for (const s of sub) {
            if (s.isDirectory() && s.name.startsWith('esbuild-')) {
              const p = path.join(pkgRoot, s.name, 'bin', 'esbuild');
              chmodIfExists(p);
            }
          }
        } catch {}
      }
    }
  } catch (e) {
    console.warn('[postinstall] pnpm esbuild scan failed', e.message);
  }
}

function ensurePythonConfig() {
  // If npm config isn't set, creating a local .npmrc with python path is preferred,
  // but some platforms ignore it. Best-effort log only.
  const pythonHint =
    process.env.npm_config_python ||
    process.env.PYTHON ||
    '/usr/bin/python3'; // common default on Linux
  console.log('[postinstall] node-gyp python hint:', pythonHint);
}

fixEsbuildPermissions();
ensurePythonConfig();
console.log('[postinstall] completed');
