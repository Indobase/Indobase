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

  showTerminal: WritableAtom<boolean> = import.meta.hot?.data.showTerminal ?? atom(true);

  constructor(webcontainerPromise: Promise<WebContainer>) {
    this.#webcontainer = webcontainerPromise;

    if (import.meta.hot) {
      import.meta.hot.data.showTerminal = this.showTerminal;
    }
  }
  get boltTerminal() {
    return this.#boltTerminal;
  }

  toggleTerminal(value?: boolean) {
    this.showTerminal.set(value !== undefined ? value : !this.showTerminal.get());
  }

  async attachBoltTerminal(terminal: ITerminal) {
    let lastError: unknown;

    for (let attempt = 1; attempt <= SHELL_ATTACH_MAX_ATTEMPTS; attempt++) {
      try {
        if (attempt === 1) {
          terminal.write(coloredText.yellow('Starting Indobase Builder workspace...\n'));
        } else {
          terminal.clear();
          terminal.write(coloredText.yellow(`Retrying Indobase Builder workspace (${attempt}/${SHELL_ATTACH_MAX_ATTEMPTS})...\n`));
          this.#boltTerminal = newBoltShellProcess();
          resetWebContainerBoot();
        }

        const wc = await getWebcontainerWithRetry(attempt === 1 ? 2 : 3);
        await this.#boltTerminal.init(wc, terminal);
        return;
      } catch (error: unknown) {
        lastError = error;

        if (attempt < SHELL_ATTACH_MAX_ATTEMPTS) {
          await sleep(2000 * attempt);
        }
      }
    }

    const message = lastError instanceof Error ? lastError.message : String(lastError);
    terminal.write(
      coloredText.red('Failed to start Indobase Builder terminal\n\n') +
        message +
        '\n\nClick the reset button above the terminal or hard-refresh the page to try again.',
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
