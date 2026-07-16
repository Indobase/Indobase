import type { WebContainer, WebContainerProcess } from '@webcontainer/api';
import { atom, type WritableAtom } from 'nanostores';
import type { ITerminal } from '~/types/terminal';
import { getWebcontainerWithRetry, resetWebContainerBoot } from '~/lib/webcontainer';
import { newBoltShellProcess, newShellProcess } from '~/utils/shell';
import { coloredText } from '~/utils/terminal';

const SHELL_ATTACH_MAX_ATTEMPTS = 3;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class TerminalStore {
  #webcontainer: Promise<WebContainer>;
  #terminals: Array<{ terminal: ITerminal; process: WebContainerProcess }> = [];
  #boltTerminal = newBoltShellProcess();
  #attachInFlight: Promise<void> | null = null;

  showTerminal: WritableAtom<boolean> = import.meta.hot?.data?.showTerminal ?? atom(true);

  constructor(webcontainerPromise: Promise<WebContainer>) {
    this.#webcontainer = webcontainerPromise;

    if (import.meta.hot?.data) {
      import.meta.hot.data.showTerminal = this.showTerminal;
    }
  }
  get boltTerminal() {
    return this.#boltTerminal;
  }

  toggleTerminal(value?: boolean) {
    this.showTerminal.set(value !== undefined ? value : !this.showTerminal.get());
  }

  async attachBoltTerminal(terminal: ITerminal, options?: { force?: boolean }) {
    if (options?.force) {
      this.#boltTerminal = newBoltShellProcess();
      resetWebContainerBoot();
    } else if (this.#attachInFlight) {
      return this.#attachInFlight;
    } else {
      try {
        await Promise.race([
          this.#boltTerminal.ready(),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error('shell not ready')), 150)),
        ]);
        return;
      } catch {
        // Shell not ready yet — continue with attach.
      }
    }

    if (this.#attachInFlight) {
      return this.#attachInFlight;
    }

    this.#attachInFlight = this.#attachBoltTerminalInternal(terminal).finally(() => {
      this.#attachInFlight = null;
    });

    return this.#attachInFlight;
  }

  async #attachBoltTerminalInternal(terminal: ITerminal) {
    let lastError: unknown;

    for (let attempt = 1; attempt <= SHELL_ATTACH_MAX_ATTEMPTS; attempt++) {
      let progressTimer: ReturnType<typeof setInterval> | undefined;

      try {
        if (attempt === 1) {
          terminal.write(coloredText.cyan('Starting Indobase Builder workspace...\n'));
        } else {
          terminal.clear();
          terminal.write(
            coloredText.cyan(`Retrying Indobase Builder workspace (${attempt}/${SHELL_ATTACH_MAX_ATTEMPTS})...\n`),
          );
          this.#boltTerminal = newBoltShellProcess();
          // Only reset the WebContainer when prior boot likely failed — shell-only hangs
          // shouldn't tear down a healthy container.
          if (attempt > 1) {
            resetWebContainerBoot();
          }
        }

        terminal.write(coloredText.dim('Booting WebContainer...\n'));
        progressTimer = setInterval(() => {
          terminal.write(coloredText.dim('Still booting WebContainer (StackBlitz)...\n'));
        }, 8_000);

        const wc = await getWebcontainerWithRetry(attempt === 1 ? 2 : 3);
        clearInterval(progressTimer);
        progressTimer = undefined;

        terminal.write(coloredText.dim('Starting shell...\n'));
        await this.#boltTerminal.init(wc, terminal);
        terminal.write(coloredText.green('Workspace ready.\n'));
        return;
      } catch (error: unknown) {
        lastError = error;
        console.warn(`Bolt terminal attach attempt ${attempt} failed:`, error);

        if (attempt < SHELL_ATTACH_MAX_ATTEMPTS) {
          await sleep(1500 * attempt);
        }
      } finally {
        if (progressTimer) {
          clearInterval(progressTimer);
        }
      }
    }

    const message = lastError instanceof Error ? lastError.message : String(lastError);
    terminal.write(
      coloredText.red('Failed to start Indobase Builder terminal\n\n') +
        message +
        '\n\nClick the reset button above the terminal (↻) or hard-refresh the page to try again.',
    );
  }

  async attachTerminal(terminal: ITerminal) {
    try {
      const shellProcess = await newShellProcess(await this.#webcontainer, terminal);
      this.#terminals.push({ terminal, process: shellProcess });
    } catch (error: any) {
      terminal.write(coloredText.red('Failed to spawn shell\n\n') + error.message);
      return;
    }
  }

  onTerminalResize(cols: number, rows: number) {
    for (const { process } of this.#terminals) {
      process.resize({ cols, rows });
    }
  }

  async detachTerminal(terminal: ITerminal) {
    const terminalIndex = this.#terminals.findIndex((t) => t.terminal === terminal);

    if (terminalIndex !== -1) {
      const { process } = this.#terminals[terminalIndex];

      try {
        process.kill();
      } catch (error) {
        console.warn('Failed to kill terminal process:', error);
      }
      this.#terminals.splice(terminalIndex, 1);
    }
  }
}
