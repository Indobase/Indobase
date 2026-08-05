/**
 * Allowlisted environment for hosted builds (LLM-generated code).
 * Never spread process.env — Builder secrets must not reach npm/vite children.
 */

const SAFE_PATH = ['/usr/local/bin', '/usr/bin', '/bin'].join(':');

function readHostPath(): string {
  const fromGlobal = (globalThis as { process?: { env?: { PATH?: string } } }).process?.env?.PATH;

  if (typeof fromGlobal === 'string' && fromGlobal.trim()) {
    return fromGlobal.includes('/usr/local/bin')
      ? fromGlobal
      : `${SAFE_PATH}:${fromGlobal}`;
  }

  return SAFE_PATH;
}

function readHostHome(): string {
  const fromGlobal = (globalThis as { process?: { env?: { HOME?: string } } }).process?.env?.HOME;

  if (typeof fromGlobal === 'string' && fromGlobal.trim()) {
    return fromGlobal;
  }

  return '/tmp';
}

export type HostedBuildChildEnvOptions = {
  /** Isolated workdir — used as HOME so npm/vite cannot write outside the build tree by default. */
  workDir: string;
  /** Shared npm cache directory (performance; still no secrets). */
  npmCacheDir?: string;
  tmpDir?: string;
};

/**
 * Minimal env for `npm install` / `npm run build` / vite preview children.
 * Project secrets belong in a written `.env` file only when explicitly required — not here.
 */
export function buildHostedBuildChildEnv(options: HostedBuildChildEnvOptions): NodeJS.ProcessEnv {
  const tmp = options.tmpDir || options.workDir;

  const env: NodeJS.ProcessEnv = {
    PATH: readHostPath(),
    HOME: options.workDir,
    TMPDIR: tmp,
    TEMP: tmp,
    TMP: tmp,
    CI: 'true',
    NODE_ENV: 'development',
    // Discourage accidental publish / funding noise
    npm_config_fund: 'false',
    npm_config_audit: 'false',
    npm_config_update_notifier: 'false',
  };

  if (options.npmCacheDir) {
    env.npm_config_cache = options.npmCacheDir;
    env.NPM_CONFIG_CACHE = options.npmCacheDir;
  }

  // Preserve locale lightly if present (harmless)
  const lang = (globalThis as { process?: { env?: { LANG?: string } } }).process?.env?.LANG;

  if (lang) {
    env.LANG = lang;
  }

  return env;
}

export function hostedBuildSafePath(): string {
  return readHostPath();
}

export function hostedBuildDefaultHome(): string {
  return readHostHome();
}
