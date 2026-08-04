import type { WebContainer, WebContainerProcess } from '@webcontainer/api';
import { path as nodePath } from '~/utils/path';
import { atom, map, type MapStore } from 'nanostores';
import {
  resolveGeneratedFileArtifact,
  sanitizeGeneratedArtifact,
  sanitizeFileAction,
  toWorkdirRelativePath,
} from '~/lib/indobase/sanitizeGeneratedArtifact';
import { resolveMigrationFilePath } from '~/lib/indobase/migrationPath';
import { seedProjectEnvIfMissing } from '~/lib/indobase/seedProjectEnv';
import {
  ensureNpmDependencies,
  isDevStartCommand,
  isToolchainReady,
} from '~/lib/indobase/ensureNpmDependencies';
import { hasRunnablePackageJson, normalizeProjectFilesRoot } from '~/lib/indobase/normalize-project-files';
import { hasWebContainerBootFailed } from '~/lib/webcontainer';
import { shouldSkipWebContainerRuntime } from '~/lib/webcontainer/preview-mode';
import { yieldAfterBatch } from '~/utils/yieldToMain';
import { COMMON_BUILD_OUTPUT_DIRS } from '~/lib/indobase/buildOutputDirs';
import { hasIndobaseStudioHandoff } from '~/lib/indobase/connection';
import { executeIndobaseSql } from '~/lib/indobase/studioSql';
import { indobaseConnection } from '~/lib/stores/indobase-connection';
import type {
  ActionAlert,
  BoltAction,
  DeployAlert,
  FileHistory,
  IndobaseBackendAction,
  IndobaseBackendAlert,
} from '~/types/actions';
import { createScopedLogger } from '~/utils/logger';
import { unreachable } from '~/utils/unreachable';
import type { ActionCallbackData } from './message-parser';
import type { BoltShell } from '~/utils/shell';

const logger = createScopedLogger('ActionRunner');

/** Kill hung `npm run build` processes so publish builds cannot block forever. */
const BUILD_PROCESS_TIMEOUT_MS = 300_000;

export type ActionStatus = 'pending' | 'running' | 'complete' | 'aborted' | 'failed';

export type BaseActionState = BoltAction & {
  status: Exclude<ActionStatus, 'failed'>;
  abort: () => void;
  executed: boolean;
  abortSignal: AbortSignal;
};

export type FailedActionState = BoltAction &
  Omit<BaseActionState, 'status'> & {
    status: Extract<ActionStatus, 'failed'>;
    error: string;
  };

export type ActionState = BaseActionState | FailedActionState;

type BaseActionUpdate = Partial<Pick<BaseActionState, 'status' | 'abort' | 'executed'>>;

export type ActionStateUpdate =
  | BaseActionUpdate
  | (Omit<BaseActionUpdate, 'status'> & { status: 'failed'; error: string });

type ActionsMap = MapStore<Record<string, ActionState>>;

/** Relative path → file contents from the workbench (in-memory), used to heal a lagging WebContainer FS. */
export type ProjectFilesProvider = () => Record<string, string>;

const INSTALL_COMMAND_RE = /\b(npm|pnpm|yarn|bun)\s+(i|install|add)\b/;

class ActionCommandError extends Error {
  readonly _output: string;
  readonly _header: string;

  constructor(message: string, output: string) {
    // Create a formatted message that includes both the error message and output
    const formattedMessage = `Failed To Execute Shell Command: ${message}\n\nOutput:\n${output}`;
    super(formattedMessage);

    // Set the output separately so it can be accessed programmatically
    this._header = message;
    this._output = output;

    // Maintain proper prototype chain
    Object.setPrototypeOf(this, ActionCommandError.prototype);

    // Set the name of the error for better debugging
    this.name = 'ActionCommandError';
  }

  // Optional: Add a method to get just the terminal output
  get output() {
    return this._output;
  }
  get header() {
    return this._header;
  }
}

export class ActionRunner {
  #webcontainer: Promise<WebContainer>;
  #currentExecutionPromise: Promise<void> = Promise.resolve();
  #shellTerminal: () => BoltShell;
  #activeBuildProcess?: WebContainerProcess;
  #fileActionCount = 0;
  #getProjectFiles?: ProjectFilesProvider;
  /** True once we kicked (or attempted) install+dev before the model's start action. */
  #earlyDevStarted = false;
  /** In-flight early Vite kickoff — formal start must await this to avoid Ctrl+C races. */
  #earlyDevPromise: Promise<void> | null = null;
  /** Set after a successful early or formal Vite bind — skip redundant start actions. */
  #devServerRunning = false;
  /** Dedupes concurrent ensureNpmDependencies from early-start + shell install. */
  #ensureDepsPromise: Promise<Awaited<ReturnType<typeof ensureNpmDependencies>>> | null = null;
  runnerId = atom<string>(`${Date.now()}`);
  actions: ActionsMap = map({});
  onAlert?: (alert: ActionAlert) => void;
  onIndobaseBackendAlert?: (alert: IndobaseBackendAlert) => void;
  onDeployAlert?: (alert: DeployAlert) => void;
  buildOutput?: { path: string; exitCode: number; output: string };
  lastShellOutput?: { exitCode: number; output: string };

  constructor(
    webcontainerPromise: Promise<WebContainer>,
    getShellTerminal: () => BoltShell,
    onAlert?: (alert: ActionAlert) => void,
    onIndobaseBackendAlert?: (alert: IndobaseBackendAlert) => void,
    onDeployAlert?: (alert: DeployAlert) => void,
    getProjectFiles?: ProjectFilesProvider,
  ) {
    this.#webcontainer = webcontainerPromise;
    this.#shellTerminal = getShellTerminal;
    this.onAlert = onAlert;
    this.onIndobaseBackendAlert = onIndobaseBackendAlert;
    this.onDeployAlert = onDeployAlert;
    this.#getProjectFiles = getProjectFiles;
  }

  addAction(data: ActionCallbackData) {
    const { actionId } = data;

    if (data.action.type === 'file') {
      const sanitized = sanitizeFileAction(data.action);

      if (!sanitized) {
        console.warn('[action-runner] skipped rejected generated path:', data.action.filePath);
        return;
      }

      data = { ...data, action: sanitized };
    }

    const action = data.action;

    const actions = this.actions.get();
    const existingAction = actions[actionId];

    if (existingAction) {
      // action already added
      return;
    }

    const abortController = new AbortController();

    this.actions.setKey(actionId, {
      ...action,
      status: 'pending',
      executed: false,
      abort: () => {
        abortController.abort();
        this.#updateAction(actionId, { status: 'aborted' });
      },
      abortSignal: abortController.signal,
    });
  }

  async runAction(data: ActionCallbackData, isStreaming: boolean = false) {
    const { actionId } = data;

    if (data.action.type === 'file') {
      const sanitized = sanitizeFileAction(data.action);

      if (!sanitized) {
        console.warn('[action-runner] skipped rejected generated path:', data.action.filePath);
        return;
      }

      data = { ...data, action: sanitized };
    }

    const incomingAction = data.action;
    const action = this.actions.get()[actionId];

    if (!action) {
      unreachable(`Action ${actionId} not found`);
    }

    if (action.executed) {
      return; // No return value here
    }

    if (isStreaming && action.type !== 'file') {
      return; // No return value here
    }

    this.#updateAction(actionId, { ...action, ...incomingAction, executed: !isStreaming });

    this.#currentExecutionPromise = this.#currentExecutionPromise
      .then(() => {
        return this.#executeAction(actionId, isStreaming);
      })
      .catch((error) => {
        logger.error('Action execution promise failed:', error);
      });

    await this.#currentExecutionPromise;

    return;
  }

  async #executeAction(actionId: string, isStreaming: boolean = false) {
    const action = this.actions.get()[actionId];

    if (!action || action.abortSignal.aborted || action.status === 'aborted') {
      this.#updateAction(actionId, { status: 'aborted' });
      return;
    }

    this.#updateAction(actionId, { status: 'running' });

    try {
      switch (action.type) {
        case 'shell': {
          await this.#runShellAction(action);
          break;
        }
        case 'file': {
          await this.#runFileAction(action);
          break;
        }
        case 'indobase': {
          try {
            await this.handleIndobaseBackendAction(action as IndobaseBackendAction);
          } catch (error: any) {
            this.#updateAction(actionId, {
              status: 'failed',
              error: error instanceof Error ? error.message : 'Indobase backend action failed',
            });

            return;
          }
          break;
        }
        case 'build': {
          const buildOutput = await this.#runBuildAction(action);

          // Store build output for deployment
          this.buildOutput = buildOutput;
          break;
        }
        case 'start': {
          /*
           * executeCommand() detaches long-running dev servers, so awaiting this does not wait
           * for process exit. It waits for the WebContainer preview port, keeping the global
           * action queue and finalizeCodegen aligned with actual preview readiness.
           */
          await this.#runStartAction(action);
          break;
        }
      }

      this.#updateAction(actionId, {
        status: isStreaming ? 'running' : action.abortSignal.aborted ? 'aborted' : 'complete',
      });
    } catch (error) {
      if (action.abortSignal.aborted) {
        return;
      }

      this.#updateAction(actionId, { status: 'failed', error: 'Action failed' });
      logger.error(`[${action.type}]:Action failed\n\n`, error);

      if (!(error instanceof ActionCommandError)) {
        return;
      }

      this.onAlert?.({
        type: 'error',
        title: 'Dev Server Failed',
        description: error.header,
        content: error.output,
      });

      // re-throw the error to be caught in the promise chain
      throw error;
    }
  }

  /**
   * Finalize / formal start await this so early Vite isn't Ctrl+C'd mid-boot.
   */
  async awaitEarlyDev(): Promise<void> {
    if (this.#earlyDevPromise) {
      await this.#earlyDevPromise;
    }
  }

  async #ensureToolchainBeforeDevStart(command: string): Promise<void> {
    if (!isDevStartCommand(command)) {
      return;
    }

    const webcontainer = await this.#awaitWebContainer();
    const installResult = await this.#ensureDepsOnce(webcontainer);

    if (!installResult.success) {
      throw new ActionCommandError(
        'Dependencies Missing',
        installResult.error ||
          'npm install did not produce node_modules/.bin/vite (or another toolchain binary). Fix install before starting the preview.',
      );
    }
  }

  async #ensureDepsOnce(webcontainer: WebContainer): Promise<Awaited<ReturnType<typeof ensureNpmDependencies>>> {
    if (!this.#ensureDepsPromise) {
      this.#ensureDepsPromise = ensureNpmDependencies(webcontainer).finally(() => {
        this.#ensureDepsPromise = null;
      });
    }

    return this.#ensureDepsPromise;
  }

  async #runShellAction(action: ActionState) {
    if (action.type !== 'shell') {
      unreachable('Expected shell action');
    }

    const isInstall = INSTALL_COMMAND_RE.test(action.content ?? '');

    if (isInstall) {
      const hydrated = await this.#hydrateWebContainerFromWorkbench();

      if (!hydrated) {
        /*
         * No usable WebContainer FS — do not fail the build phase when a runnable package.json
         * exists; server draft preview installs from workbench files in finalizeBuildAndMaybeRepair.
         * Without package.json, marking install "complete" lied to BuildPlan ("Packages installed").
         */
        if (!hasRunnablePackageJson(this.#getProjectFiles?.() ?? {})) {
          throw new ActionCommandError(
            'Project Incomplete',
            'Missing root package.json — cannot install packages or start a draft preview. Write package.json at the project root (not a nested folder), then npm install.',
          );
        }

        logger.warn('Skipping WebContainer npm install; will use server draft preview');
        this.lastShellOutput = {
          exitCode: 0,
          output: '[skipped] WebContainer unavailable — server draft preview will install packages',
        };
        return;
      }

      try {
        const webcontainer = await this.#awaitWebContainer();

        if (await isToolchainReady(webcontainer)) {
          logger.info('Skipping npm install — toolchain already present (vite/bin ready)');
          this.lastShellOutput = {
            exitCode: 0,
            output: '[skipped] node_modules toolchain already installed',
          };
          void this.#kickEarlyDevIfReady();
          return;
        }

        // Bare install → shared ensure path (dedupes with early Vite kickoff).
        if (/^\s*(?:npm|pnpm|yarn)\s+(?:i|install)\b/i.test(action.content) && !/\badd\b/i.test(action.content)) {
          const installResult = await this.#ensureDepsOnce(webcontainer);

          if (!installResult.success) {
            throw new ActionCommandError(
              'Dependencies Missing',
              installResult.error || 'npm install failed',
            );
          }

          this.lastShellOutput = {
            exitCode: 0,
            output: installResult.output || '[ok] dependencies ensured',
          };
          void this.#kickEarlyDevIfReady();
          return;
        }
      } catch (error) {
        if (error instanceof ActionCommandError) {
          throw error;
        }

        logger.warn('Toolchain readiness check failed; continuing with install', error);
      }
    }

    const shell = this.#shellTerminal();

    try {
      await Promise.race([
        shell.ready(),
        new Promise<never>((_, reject) => {
          setTimeout(() => {
            reject(new Error('Terminal is not ready yet. Open the terminal panel and try again.'));
          }, 30_000);
        }),
      ]);
    } catch (error) {
      if (isInstall) {
        logger.warn('Skipping WebContainer npm install; terminal not ready', error);
        this.lastShellOutput = {
          exitCode: 0,
          output: '[skipped] Terminal not ready — server draft preview will install packages',
        };
        return;
      }

      throw error;
    }

    if (!shell || !shell.terminal || !shell.process) {
      unreachable('Shell terminal not found');
    }

    await this.#ensureToolchainBeforeDevStart(action.content);

    // Pre-validate command for common issues
    const validationResult = await this.#validateShellCommand(action.content);

    if (validationResult.shouldModify && validationResult.modifiedCommand) {
      logger.debug(`Modified command: ${action.content} -> ${validationResult.modifiedCommand}`);
      action.content = validationResult.modifiedCommand;
    }

    const resp = await shell.executeCommand(
      this.runnerId.get(),
      action.content,
      () => {
        logger.debug(`[${action.type}]:Aborting Action\n\n`, action);
        action.abort();
      },
      action.exitTimeoutMs != null ? { exitTimeoutMs: action.exitTimeoutMs } : undefined,
    );
    logger.debug(`${action.type} Shell Response: [exit code:${resp?.exitCode}]`);

    this.lastShellOutput = {
      exitCode: resp?.exitCode ?? 1,
      output: resp?.output ?? '',
    };

    if (resp?.exitCode != 0) {
      const enhancedError = this.#createEnhancedShellError(action.content, resp?.exitCode, resp?.output);
      throw new ActionCommandError(enhancedError.title, enhancedError.details);
    }

    if (isInstall) {
      void this.#kickEarlyDevIfReady();
    }
  }

  async #runStartAction(action: ActionState) {
    if (action.type !== 'start') {
      unreachable('Expected shell action');
    }

    if (!this.#shellTerminal) {
      unreachable('Shell terminal not found');
    }

    const hydrated = await this.#hydrateWebContainerFromWorkbench();

    if (!hydrated) {
      if (!hasRunnablePackageJson(this.#getProjectFiles?.() ?? {})) {
        throw new ActionCommandError(
          'Project Incomplete',
          'Missing root package.json — cannot start the preview. Write a complete root-level Vite/Expo package.json with a dev script, then npm install and npm run dev.',
        );
      }

      logger.warn('Skipping WebContainer dev server; will use server draft preview');
      this.lastShellOutput = {
        exitCode: 0,
        output: '[skipped] WebContainer unavailable — server draft preview will start the app',
      };
      return;
    }

    const shell = this.#shellTerminal();
    await Promise.race([
      shell.ready(),
      new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error('Terminal is not ready yet. Open the terminal panel and try again.'));
        }, 45_000);
      }),
    ]);

    if (!shell || !shell.terminal || !shell.process) {
      unreachable('Shell terminal not found');
    }

    /*
     * Do NOT hard-gate the start action on source validation: booting Vite with broken sources is
     * fine (it serves the error overlay and HMR-reloads once the repair turn writes fixes), while
     * refusing to start left builds with "No preview available" and nothing to repair against.
     * Health gating lives in finalizeCodegen (syntax + missing-import + Vite transform checks).
     *
     * DO gate on a real toolchain install: `npm run dev` with no node_modules/.bin/vite produces
     * the cryptic `sh: command not found: vite` instead of a recoverable preview.
     */
    const webcontainer = await this.#awaitWebContainer();
    await this.#ensureToolchainBeforeDevStart(action.content);

    // Wait for early kickoff so we don't abort its shell command with a second executeCommand.
    await this.awaitEarlyDev();

    if (await this.#hasHealthyPreviewPort(webcontainer)) {
      logger.info('Skipping npm run dev — healthy preview already running (early start / prior turn)');
      this.lastShellOutput = {
        exitCode: 0,
        output: '[skipped] Dev server already running',
      };
      return;
    }

    const resp = await shell.executeCommand(
      this.runnerId.get(),
      action.content,
      () => {
        logger.debug(`[${action.type}]:Aborting Action\n\n`, action);
        action.abort();
      },

      // Dev servers never emit an exit OSC; do not kill them with the shell backstop.
      { exitTimeoutMs: 0 },
    );
    logger.debug(`${action.type} Shell Response: [exit code:${resp?.exitCode}]`);

    if (resp?.exitCode != 0) {
      throw new ActionCommandError('Failed To Start Application', resp?.output || 'No Output Available');
    }

    /*
     * executeCommand with exitTimeoutMs:0 returns success after ~2s without verifying the
     * server bound a port — that left "Start Application" checked with "No preview available".
     * Wait for WebContainer to report an open port before claiming success.
     */
    await this.#waitForPreviewPort(webcontainer, 90_000);
    this.#devServerRunning = true;

    return resp;
  }

  async #hasOpenPreviewPort(webcontainer: WebContainer): Promise<boolean> {
    try {
      const ports = typeof (webcontainer as any).getPorts === 'function' ? await (webcontainer as any).getPorts() : [];
      return Array.isArray(ports) && ports.length > 0;
    } catch {
      return false;
    }
  }

  /**
   * Skip start only when we previously claimed a successful Vite bind and a port is still open.
   * Bare getPorts() alone can be a stale zombie from a half-dead process.
   */
  async #hasHealthyPreviewPort(webcontainer: WebContainer): Promise<boolean> {
    return this.#devServerRunning && (await this.#hasOpenPreviewPort(webcontainer));
  }

  #waitForPreviewPort(webcontainer: WebContainer, timeoutMs: number): Promise<void> {
    return new Promise((resolve, reject) => {
      let settled = false;

      const finish = (error?: Error) => {
        if (settled) {
          return;
        }

        settled = true;
        clearTimeout(timer);

        if (error) {
          reject(error);
        } else {
          resolve();
        }
      };

      const timer = setTimeout(() => {
        finish(
          new ActionCommandError(
            'Dev Server Failed',
            'The start command ran but no preview port opened within 90s. Check that `npm install` succeeded and the dev script starts Vite/Expo on a listening port.',
          ),
        );
      }, timeoutMs);

      try {
        webcontainer.on('server-ready', () => {
          logger.info('[start] server-ready received');
          finish();
        });
        webcontainer.on('port', (port, type, url) => {
          if (type === 'open') {
            logger.info(`[start] port open: ${port} ${url}`);
            finish();
          }
        });
      } catch (error) {
        finish(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  async #runFileAction(action: ActionState) {
    if (action.type !== 'file') {
      unreachable('Expected file action');
    }

    const sanitized = resolveGeneratedFileArtifact(action.filePath, action.content);

    /*
     * Workbench already upserts this file in memory before we run. WebContainer sync is
     * best-effort: a Brave/extension/COOP glitch must not mark the action failed or the UI
     * shows "Some files could not be created" while the editor and server draft still have
     * the content. Hydrate from workbench before install/start instead.
     */
    try {
      const webcontainer = await this.#awaitWebContainer();
      const relativePath = toWorkdirRelativePath(webcontainer.workdir, sanitized.filePath);

      let folder = nodePath.dirname(relativePath);

      // remove trailing slashes
      folder = folder.replace(/\/+$/g, '');

      if (folder !== '.') {
        await webcontainer.fs.mkdir(folder, { recursive: true });
        logger.debug('Created folder', folder);
      }

      await webcontainer.fs.writeFile(relativePath, sanitized.content);
      logger.debug(`File written ${relativePath}`);

      const connection = indobaseConnection.get();

      if (hasIndobaseStudioHandoff(connection)) {
        await this.#ensureProjectEnvFile(webcontainer, connection);
      }
    } catch (error) {
      logger.warn(
        `WebContainer write failed for ${sanitized.filePath}; keeping in-memory workbench copy`,
        error,
      );
    }

    this.#fileActionCount += 1;
    await yieldAfterBatch(this.#fileActionCount, 4);
    void this.#kickEarlyDevIfReady();
  }

  /**
   * As soon as a Vite scaffold exists in the workbench, install (if needed) and start the
   * dev server in the background so later file writes HMR into a live preview — instead of
   * waiting for the model's trailing start action after every file is written.
   */
  async #kickEarlyDevIfReady(): Promise<void> {
    if (this.#earlyDevStarted || this.#earlyDevPromise || shouldSkipWebContainerRuntime(hasWebContainerBootFailed())) {
      return;
    }

    const files = normalizeProjectFilesRoot(this.#getProjectFiles?.() ?? {}).files;
    const pkg = files['package.json'];

    if (!pkg || !/\bvite\b/i.test(pkg)) {
      return;
    }

    const hasEntry =
      Boolean(files['index.html']) ||
      Boolean(files['src/main.tsx']) ||
      Boolean(files['src/main.jsx']) ||
      Boolean(files['src/main.ts']) ||
      Boolean(files['src/main.js']) ||
      Boolean(files['App.tsx']) ||
      Boolean(files['App.jsx']);

    if (!hasEntry) {
      return;
    }

    this.#earlyDevStarted = true;
    this.#earlyDevPromise = this.#runEarlyDevKickoff().finally(() => {
      this.#earlyDevPromise = null;
    });
    await this.#earlyDevPromise;
  }

  async #runEarlyDevKickoff(): Promise<void> {
    try {
      const hydrated = await this.#hydrateWebContainerFromWorkbench();

      if (!hydrated) {
        this.#earlyDevStarted = false;
        return;
      }

      const webcontainer = await this.#awaitWebContainer();

      if (await this.#hasHealthyPreviewPort(webcontainer)) {
        return;
      }

      const installResult = await this.#ensureDepsOnce(webcontainer);

      if (!installResult.success) {
        logger.warn('Early dev install failed; formal start action will retry', installResult.error);
        this.#earlyDevStarted = false;
        return;
      }

      const shell = this.#shellTerminal();

      await Promise.race([
        shell.ready(),
        new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('Terminal not ready for early dev')), 20_000);
        }),
      ]);

      if (await this.#hasHealthyPreviewPort(webcontainer)) {
        return;
      }

      logger.info('Early-starting npm run dev before codegen finishes');
      await shell.executeCommand(this.runnerId.get(), 'npm run dev', () => undefined, { exitTimeoutMs: 0 });

      // Give the port a short window to bind before formal start may run.
      try {
        await this.#waitForPreviewPort(webcontainer, 25_000);
        this.#devServerRunning = true;
      } catch (error) {
        logger.warn('Early Vite started but port not ready yet; formal start may retry', error);
        this.#earlyDevStarted = false;
      }
    } catch (error) {
      logger.warn('Early dev start failed; formal start action will retry', error);
      this.#earlyDevStarted = false;
    }
  }

  /**
   * Push in-memory workbench sources into the WebContainer FS before npm install / dev.
   * Returns false when the runtime is unusable — callers should skip WC shell work and rely
   * on server draft preview.
   */
  async #hydrateWebContainerFromWorkbench(): Promise<boolean> {
    const files = this.#getProjectFiles?.() ?? {};
    const entries = Object.entries(files);

    if (entries.length === 0) {
      return false;
    }

    try {
      const webcontainer = await this.#awaitWebContainer();

      for (const [relativePath, content] of entries) {
        const folder = nodePath.dirname(relativePath).replace(/\/+$/g, '');

        if (folder && folder !== '.') {
          await webcontainer.fs.mkdir(folder, { recursive: true });
        }

        await webcontainer.fs.writeFile(relativePath, content);
      }

      logger.info(`Hydrated WebContainer with ${entries.length} workbench file(s)`);
      return true;
    } catch (error) {
      logger.warn('WebContainer hydrate from workbench failed', error);
      return false;
    }
  }

  async #ensureProjectEnvFile(
    webcontainer: WebContainer,
    connection: NonNullable<ReturnType<typeof indobaseConnection.get>>,
  ) {
    try {
      await seedProjectEnvIfMissing(
        (filePath, content) => webcontainer.fs.writeFile(filePath, content),
        (filePath) => webcontainer.fs.readFile(filePath, 'utf-8'),
        connection,
      );
    } catch (error) {
      logger.error('Failed to seed project .env\n\n', error);
    }
  }

  #updateAction(id: string, newState: ActionStateUpdate) {
    const actions = this.actions.get();

    this.actions.setKey(id, { ...actions[id], ...newState });
  }

  async #awaitWebContainer(): Promise<WebContainer> {
    if (hasWebContainerBootFailed()) {
      throw new Error(
        'WebContainer did not become ready in time. Preview will use the server draft build instead. Click Reset Terminal or hard-refresh (Chrome/Edge).',
      );
    }

    return Promise.race([
      this.#webcontainer,
      new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(
            new Error(
              'WebContainer did not become ready in time. Preview will use the server draft build instead. Click Reset Terminal or hard-refresh (Chrome/Edge).',
            ),
          );
        }, 95_000);
      }),
    ]);
  }

  async getFileHistory(filePath: string): Promise<FileHistory | null> {
    try {
      const webcontainer = await this.#webcontainer;
      const historyPath = this.#getHistoryPath(filePath);
      const content = await webcontainer.fs.readFile(historyPath, 'utf-8');

      return JSON.parse(content);
    } catch (error) {
      logger.error('Failed to get file history:', error);
      return null;
    }
  }

  async saveFileHistory(filePath: string, history: FileHistory) {
    // const webcontainer = await this.#webcontainer;
    const historyPath = this.#getHistoryPath(filePath);

    await this.#runFileAction({
      type: 'file',
      filePath: historyPath,
      content: JSON.stringify(history),
      changeSource: 'auto-save',
    } as any);
  }

  #getHistoryPath(filePath: string) {
    return nodePath.join('.history', filePath);
  }

  async #runBuildAction(action: ActionState) {
    if (action.type !== 'build') {
      unreachable('Expected build action');
    }

    // Trigger build started alert
    this.onDeployAlert?.({
      type: 'info',
      title: 'Building Application',
      description: 'Building your application...',
      stage: 'building',
      buildStatus: 'running',
      deployStatus: 'pending',
      source: 'netlify',
    });

    const webcontainer = await this.#webcontainer;

    const installResult = await ensureNpmDependencies(webcontainer);

    if (!installResult.success) {
      const installError = installResult.error || 'npm install failed before build';
      this.buildOutput = { path: '', exitCode: 1, output: installError };
      this.onDeployAlert?.({
        type: 'error',
        title: 'Build Failed',
        description: 'Could not install dependencies before build',
        content: installError,
        stage: 'building',
        buildStatus: 'failed',
        deployStatus: 'pending',
        source: 'netlify',
      });
      throw new ActionCommandError('Build Failed', installError);
    }

    // Create a new terminal specifically for the build
    const buildProcess = await webcontainer.spawn('npm', ['run', 'build']);
    this.#activeBuildProcess = buildProcess;

    let output = '';
    const outputPromise = buildProcess.output.pipeTo(
      new WritableStream({
        write(data) {
          output += data;
        },
      }),
    );

    let exitCode: number;
    let timedOut = false;
    let buildTimeoutId: ReturnType<typeof setTimeout> | undefined;

    try {
      exitCode = await Promise.race([
        buildProcess.exit,
        new Promise<number>((resolve) => {
          buildTimeoutId = setTimeout(() => {
            timedOut = true;

            try {
              buildProcess.kill();
            } catch (error) {
              logger.warn('Failed to kill timed-out build process', error);
            }

            resolve(124);
          }, BUILD_PROCESS_TIMEOUT_MS);
        }),
      ]);
      await outputPromise.catch(() => {
        // Ignore output piping errors; we still have whatever was captured
      });
    } finally {
      if (buildTimeoutId) {
        clearTimeout(buildTimeoutId);
      }

      this.#activeBuildProcess = undefined;
    }

    if (timedOut) {
      output += `\n[build timed out after ${Math.round(BUILD_PROCESS_TIMEOUT_MS / 1000)}s]`;
    }

    let buildDir = '';

    if (exitCode !== 0) {
      const buildResult = {
        path: buildDir,
        exitCode,
        output,
      };

      this.buildOutput = buildResult;

      // Trigger build failed alert
      this.onDeployAlert?.({
        type: 'error',
        title: 'Build Failed',
        description: 'Your application build failed',
        content: output || 'No build output available',
        stage: 'building',
        buildStatus: 'failed',
        deployStatus: 'pending',
        source: 'netlify',
      });

      throw new ActionCommandError('Build Failed', output || 'No Output Available');
    }

    // Trigger build success alert
    this.onDeployAlert?.({
      type: 'success',
      title: 'Build Completed',
      description: 'Your application was built successfully',
      stage: 'deploying',
      buildStatus: 'complete',
      deployStatus: 'running',
      source: 'netlify',
    });

    // Check for common build directories
    const commonBuildDirs = [...COMMON_BUILD_OUTPUT_DIRS];

    // Try to find the first existing build directory
    for (const dir of commonBuildDirs) {
      const dirPath = nodePath.join(webcontainer.workdir, dir);

      try {
        await webcontainer.fs.readdir(dirPath);
        buildDir = dirPath;
        break;
      } catch {
        continue;
      }
    }

    // If no build directory was found, use the default (dist)
    if (!buildDir) {
      buildDir = nodePath.join(webcontainer.workdir, 'dist');
    }

    const buildResult = {
      path: buildDir,
      exitCode,
      output,
    };

    this.buildOutput = buildResult;

    return buildResult;
  }
  async handleIndobaseBackendAction(action: IndobaseBackendAction) {
    const { operation, content, filePath } = action;
    logger.debug('[Indobase Backend Action]:', { operation, filePath, content });

    switch (operation) {
      case 'migration': {
        const sanitizedPath = sanitizeGeneratedArtifact(resolveMigrationFilePath(filePath), content ?? '').filePath;

        this.onIndobaseBackendAlert?.({
          type: 'info',
          title: 'Indobase Migration',
          description: `Create migration file: ${sanitizedPath}`,
          content,
          source: 'indobase',
        });

        await this.#runFileAction({
          type: 'file',
          filePath: sanitizedPath,
          content,
          changeSource: 'indobase',
        } as any);

        const connection = indobaseConnection.get();

        if (hasIndobaseStudioHandoff(connection) && content?.trim()) {
          try {
            const migrationName = sanitizedPath
              .split('/')
              .pop()
              ?.replace(/\.sql$/i, '');
            await executeIndobaseSql({
              connection,
              query: content,
              operation: 'migration',
              name: migrationName,
            });
          } catch (error) {
            logger.warn('Failed to auto-apply Indobase migration', error);
            this.onIndobaseBackendAlert?.({
              type: 'error',
              title: 'Indobase Migration',
              description: 'Migration file was written but SQL apply failed',
              content,
              source: 'indobase',
            });
          }
        }

        return { success: true };
      }

      case 'query': {
        this.onIndobaseBackendAlert?.({
          type: 'info',
          title: 'Indobase Query',
          description: 'Execute database query',
          content,
          source: 'indobase',
        });

        return { pending: true };
      }

      default: {
        logger.warn(`Unknown Indobase backend operation: ${operation}`);
        this.onIndobaseBackendAlert?.({
          type: 'error',
          title: 'Indobase Action Failed',
          description: `Unsupported database operation: ${operation ?? 'unknown'}`,
          content,
          source: 'indobase',
        });

        return { success: false };
      }
    }
  }

  async abortActiveActions() {
    const actions = Object.entries(this.actions.get());

    for (const [actionId, action] of actions) {
      if (action.status === 'complete' || action.status === 'failed' || action.status === 'aborted') {
        continue;
      }

      action.abort();
      this.#updateAction(actionId, { status: 'aborted' });
    }

    try {
      await this.#shellTerminal().abortCurrentExecution();
    } catch (error) {
      logger.warn('Failed to interrupt active shell execution', error);
    }

    if (this.#activeBuildProcess) {
      try {
        this.#activeBuildProcess.kill();
      } catch (error) {
        logger.warn('Failed to terminate active build process', error);
      } finally {
        this.#activeBuildProcess = undefined;
      }
    }
  }

  // Add this method declaration to the class
  handleDeployAction(
    stage: 'building' | 'deploying' | 'complete',
    status: ActionStatus,
    details?: {
      url?: string;
      error?: string;
      source?: 'netlify' | 'vercel' | 'github' | 'gitlab';
    },
  ): void {
    if (!this.onDeployAlert) {
      logger.debug('No deploy alert handler registered');
      return;
    }

    const alertType = status === 'failed' ? 'error' : status === 'complete' ? 'success' : 'info';

    const title =
      stage === 'building'
        ? 'Building Application'
        : stage === 'deploying'
          ? 'Deploying Application'
          : 'Deployment Complete';

    const description =
      status === 'failed'
        ? `${stage === 'building' ? 'Build' : 'Deployment'} failed`
        : status === 'running'
          ? `${stage === 'building' ? 'Building' : 'Deploying'} your application...`
          : status === 'complete'
            ? `${stage === 'building' ? 'Build' : 'Deployment'} completed successfully`
            : `Preparing to ${stage === 'building' ? 'build' : 'deploy'} your application`;

    const buildStatus =
      stage === 'building' ? status : stage === 'deploying' || stage === 'complete' ? 'complete' : 'pending';

    const deployStatus = stage === 'building' ? 'pending' : status;

    this.onDeployAlert({
      type: alertType,
      title,
      description,
      content: details?.error || '',
      url: details?.url,
      stage,
      buildStatus: buildStatus as any,
      deployStatus: deployStatus as any,
      source: details?.source || 'netlify',
    });
  }

  async #validateShellCommand(command: string): Promise<{
    shouldModify: boolean;
    modifiedCommand?: string;
    warning?: string;
  }> {
    const trimmedCommand = command.trim();

    // Handle rm commands that might fail due to missing files
    if (trimmedCommand.startsWith('rm ') && !trimmedCommand.includes(' -f')) {
      const rmMatch = trimmedCommand.match(/^rm\s+(.+)$/);

      if (rmMatch) {
        const filePaths = rmMatch[1].split(/\s+/);

        // Check if any of the files exist using WebContainer
        try {
          const webcontainer = await this.#webcontainer;
          const existingFiles = [];

          for (const filePath of filePaths) {
            if (filePath.startsWith('-')) {
              continue;
            } // Skip flags

            try {
              await webcontainer.fs.readFile(filePath);
              existingFiles.push(filePath);
            } catch {
              // File doesn't exist, skip it
            }
          }

          if (existingFiles.length === 0) {
            // No files exist, modify command to use -f flag to avoid error
            return {
              shouldModify: true,
              modifiedCommand: `rm -f ${filePaths.join(' ')}`,
              warning: 'Added -f flag to rm command as target files do not exist',
            };
          } else if (existingFiles.length < filePaths.length) {
            // Some files don't exist, modify to only remove existing ones with -f for safety
            return {
              shouldModify: true,
              modifiedCommand: `rm -f ${filePaths.join(' ')}`,
              warning: 'Added -f flag to rm command as some target files do not exist',
            };
          }
        } catch (error) {
          logger.debug('Could not validate rm command files:', error);
        }
      }
    }

    // Handle cd commands to non-existent directories
    if (trimmedCommand.startsWith('cd ')) {
      const cdMatch = trimmedCommand.match(/^cd\s+(.+)$/);

      if (cdMatch) {
        const targetDir = cdMatch[1].trim();

        try {
          const webcontainer = await this.#webcontainer;
          await webcontainer.fs.readdir(targetDir);
        } catch {
          return {
            shouldModify: true,
            modifiedCommand: `mkdir -p ${targetDir} && cd ${targetDir}`,
            warning: 'Directory does not exist, created it first',
          };
        }
      }
    }

    // Handle cp/mv commands with missing source files
    if (trimmedCommand.match(/^(cp|mv)\s+/)) {
      const parts = trimmedCommand.split(/\s+/);

      if (parts.length >= 3) {
        const sourceFile = parts[1];

        try {
          const webcontainer = await this.#webcontainer;
          await webcontainer.fs.readFile(sourceFile);
        } catch {
          return {
            shouldModify: false,
            warning: `Source file '${sourceFile}' does not exist`,
          };
        }
      }
    }

    return { shouldModify: false };
  }

  #createEnhancedShellError(
    command: string,
    exitCode: number | undefined,
    output: string | undefined,
  ): {
    title: string;
    details: string;
  } {
    const trimmedCommand = command.trim();
    const firstWord = trimmedCommand.split(/\s+/)[0];

    // Common error patterns and their explanations
    const errorPatterns = [
      {
        pattern: /cannot remove.*No such file or directory/,
        title: 'File Not Found',
        getMessage: () => {
          const fileMatch = output?.match(/'([^']+)'/);
          const fileName = fileMatch ? fileMatch[1] : 'file';

          return `The file '${fileName}' does not exist and cannot be removed.\n\nSuggestion: Use 'ls' to check what files exist, or use 'rm -f' to ignore missing files.`;
        },
      },
      {
        pattern: /No such file or directory/,
        title: 'File or Directory Not Found',
        getMessage: () => {
          if (trimmedCommand.startsWith('cd ')) {
            const dirMatch = trimmedCommand.match(/cd\s+(.+)/);
            const dirName = dirMatch ? dirMatch[1] : 'directory';

            return `The directory '${dirName}' does not exist.\n\nSuggestion: Use 'mkdir -p ${dirName}' to create it first, or check available directories with 'ls'.`;
          }

          return `The specified file or directory does not exist.\n\nSuggestion: Check the path and use 'ls' to see available files.`;
        },
      },
      {
        pattern: /Permission denied/,
        title: 'Permission Denied',
        getMessage: () =>
          `Permission denied for '${firstWord}'.\n\nSuggestion: The file may not be executable. Try 'chmod +x filename' first.`,
      },
      {
        pattern: /command not found:\s*vite|vite:.*not found|Cannot find module ['"]vite['"]/i,
        title: 'Vite Not Installed',
        getMessage: () =>
          `Vite is not available in node_modules/.bin.\n\nSuggestion: Run \`npm install --include=dev\` and confirm package.json lists vite under dependencies or devDependencies before \`npm run dev\`.`,
      },
      {
        pattern: /command not found/,
        title: 'Command Not Found',
        getMessage: () =>
          `The command '${firstWord}' is not available in WebContainer.\n\nSuggestion: Check available commands or use a package manager to install it.`,
      },
      {
        pattern: /Is a directory/,
        title: 'Target is a Directory',
        getMessage: () =>
          `Cannot perform this operation - target is a directory.\n\nSuggestion: Use 'ls' to list directory contents or add appropriate flags.`,
      },
      {
        pattern: /File exists/,
        title: 'File Already Exists',
        getMessage: () => `File already exists.\n\nSuggestion: Use a different name or add '-f' flag to overwrite.`,
      },
    ];

    // Try to match known error patterns
    for (const errorPattern of errorPatterns) {
      if (output && errorPattern.pattern.test(output)) {
        return {
          title: errorPattern.title,
          details: errorPattern.getMessage(),
        };
      }
    }

    // Generic error with suggestions based on command type
    let suggestion = '';

    if (trimmedCommand.startsWith('npm ')) {
      suggestion = '\n\nSuggestion: Try running "npm install" first or check package.json.';
    } else if (trimmedCommand.startsWith('git ')) {
      suggestion = "\n\nSuggestion: Check if you're in a git repository or if remote is configured.";
    } else if (trimmedCommand.match(/^(ls|cat|rm|cp|mv)/)) {
      suggestion = '\n\nSuggestion: Check file paths and use "ls" to see available files.';
    }

    return {
      title: `Command Failed (exit code: ${exitCode})`,
      details: `Command: ${trimmedCommand}\n\nOutput: ${output || 'No output available'}${suggestion}`,
    };
  }
}
