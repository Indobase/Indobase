import type { WebContainer, WebContainerProcess } from '@webcontainer/api';
import type { ITerminal } from '~/types/terminal';
import { withResolvers } from './promises';
import { atom } from 'nanostores';
import { expoUrlAtom } from '~/lib/stores/qrCodeStore';

export async function newShellProcess(webcontainer: WebContainer, terminal: ITerminal) {
  const args: string[] = [];

  // we spawn a JSH process with a fallback cols and rows in case the process is not attached yet to a visible terminal
  const process = await webcontainer.spawn('/bin/jsh', ['--osc', ...args], {
    terminal: {
      cols: terminal.cols ?? 80,
      rows: terminal.rows ?? 15,
    },
  });

  const input = process.input.getWriter();
  const output = process.output;

  const jshReady = withResolvers<void>();

  let isInteractive = false;
  output.pipeTo(
    new WritableStream({
      write(data) {
        if (!isInteractive) {
          const [, osc] = data.match(/\x1b\]654;([^\x07]+)\x07/) || [];

          if (osc === 'interactive') {
            // wait until we see the interactive OSC
            isInteractive = true;

            jshReady.resolve();
          }
        }

        terminal.write(data);

        // Capture terminal output for debugging
        try {
          import('~/utils/debugLogger')
            .then(({ captureTerminalLog }) => {
              // Clean the data by removing ANSI escape sequences for logging
              const cleanData = data.replace(/\x1b\[[0-9;]*[mG]/g, '').trim();

              if (cleanData) {
                captureTerminalLog(cleanData, 'output');
              }
            })
            .catch(() => {
              // Ignore if debug logger is not available
            });
        } catch {
          // Ignore errors in debug logging
        }
      },
    }),
  );

  terminal.onData((data) => {
    // console.log('terminal onData', { data, isInteractive });

    if (isInteractive) {
      input.write(data);

      // Capture terminal input for debugging
      try {
        import('~/utils/debugLogger')
          .then(({ captureTerminalLog }) => {
            // Clean the data and check if it's a command (not just cursor movement)
            const cleanData = data.replace(/\x1b\[[0-9;]*[A-Z]/g, '').trim();

            if (cleanData && cleanData !== '\r' && cleanData !== '\n') {
              captureTerminalLog(cleanData, 'input');
            }
          })
          .catch(() => {
            // Ignore if debug logger is not available
          });
      } catch {
        // Ignore errors in debug logging
      }
    }
  });

  await jshReady.promise;

  return process;
}

export type ExecutionResult = { output: string; exitCode: number; timedOut?: boolean } | undefined;

/** Wait for the shell prompt OSC after Ctrl+C before writing the next command. */
export const SHELL_PROMPT_TIMEOUT_MS = 10_000;
/** Backstop so non-terminating processes cannot block the UI forever. */
export const SHELL_EXIT_TIMEOUT_MS = 600_000;

export class BoltShell {
  #initialized: (() => void) | undefined;
  #readyPromise: Promise<void>;
  #webcontainer: WebContainer | undefined;
  #terminal: ITerminal | undefined;
  #process: WebContainerProcess | undefined;
  executionState = atom<
    | {
        sessionId: string
        active: boolean
        /** Long-running process (e.g. `npm run dev`) that never emits an exit OSC. */
        background?: boolean
        executionPrms?: Promise<any>
        abort?: () => void
      }
    | undefined
  >();
  #outputStream: ReadableStreamDefaultReader<string> | undefined;
  #shellInputStream: WritableStreamDefaultWriter<string> | undefined;
  #outputPumpStarted = false;
  #outputPumpDone = false;
  #outputChunks: string[] = [];
  #outputWaiters: Array<() => void> = [];

  constructor() {
    this.#readyPromise = new Promise((resolve) => {
      this.#initialized = resolve;
    });
  }

  ready() {
    return this.#readyPromise;
  }

  async init(webcontainer: WebContainer, terminal: ITerminal) {
    this.#webcontainer = webcontainer;
    this.#terminal = terminal;

    // Use all three streams from tee: one for terminal, one for command execution, one for Expo URL detection
    const { process, commandStream, expoUrlStream } = await this.newBoltShellProcess(webcontainer, terminal);
    this.#process = process;
    this.#outputStream = commandStream.getReader();

    // Start background Expo URL watcher immediately
    this._watchExpoUrlInBackground(expoUrlStream);

    await this.waitTillOscCode('interactive');
    this.#initialized?.();
  }

  async newBoltShellProcess(webcontainer: WebContainer, terminal: ITerminal) {
    const args: string[] = [];
    const process = await webcontainer.spawn('/bin/jsh', ['--osc', ...args], {
      terminal: {
        cols: terminal.cols ?? 80,
        rows: terminal.rows ?? 15,
      },
    });

    const input = process.input.getWriter();
    this.#shellInputStream = input;

    // Tee the output so we can have three independent readers
    const [streamA, streamB] = process.output.tee();
    const [streamC, streamD] = streamB.tee();

    const jshReady = withResolvers<void>();
    let isInteractive = false;
    streamA.pipeTo(
      new WritableStream({
        write(data) {
          if (!isInteractive) {
            const [, osc] = data.match(/\x1b\]654;([^\x07]+)\x07/) || [];

            if (osc === 'interactive') {
              isInteractive = true;
              jshReady.resolve();
            }
          }

          terminal.write(data);
        },
      }),
    );

    terminal.onData((data) => {
      if (isInteractive) {
        input.write(data);
      }
    });

    await jshReady.promise;

    // Return all streams for use in init
    return { process, terminalStream: streamA, commandStream: streamC, expoUrlStream: streamD };
  }

  // Dedicated background watcher for Expo URL
  private async _watchExpoUrlInBackground(stream: ReadableStream<string>) {
    const reader = stream.getReader();
    let buffer = '';
    const expoUrlRegex = /(exp:\/\/[^\s]+)/;

    while (true) {
      const { value, done } = await reader.read();

      if (done) {
        break;
      }

      buffer += value || '';

      const expoUrlMatch = buffer.match(expoUrlRegex);

      if (expoUrlMatch) {
        const cleanUrl = expoUrlMatch[1]
          .replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '')
          .replace(/[^\x20-\x7E]+$/g, '');
        expoUrlAtom.set(cleanUrl);
        buffer = buffer.slice(buffer.indexOf(expoUrlMatch[1]) + expoUrlMatch[1].length);
      }

      if (buffer.length > 2048) {
        buffer = buffer.slice(-2048);
      }
    }
  }

  get terminal() {
    return this.#terminal;
  }

  get process() {
    return this.#process;
  }

  async executeCommand(
    sessionId: string,
    command: string,
    abort?: () => void,
    options?: { exitTimeoutMs?: number },
  ): Promise<ExecutionResult> {
    if (!this.process || !this.terminal) {
      return undefined;
    }

    const state = this.executionState.get();

    if (state?.active && state.abort) {
      state.abort();
    }

    /*
     * interrupt the current execution
     *  this.#shellInputStream?.write('\x03');
     */
    this.terminal.input('\x03');
    // Proceed even if the prompt OSC never arrives so the next command is still written.
    await this.waitTillOscCode('prompt', SHELL_PROMPT_TIMEOUT_MS);

    /*
     * Never await a prior start/dev-server promise forever — that left Tester stuck at 0/1
     * after template `npm run dev` occupied the shared shell.
     */
    if (state?.executionPrms) {
      await Promise.race([
        state.executionPrms.catch(() => undefined),
        new Promise<void>((resolve) => {
          setTimeout(resolve, SHELL_PROMPT_TIMEOUT_MS);
        }),
      ]);
    }

    //start a new execution
    this.terminal.input(command.trim() + '\n');

    //wait for the execution to finish (0 / negative = background / never wait for exit)
    const exitTimeoutMs = options?.exitTimeoutMs ?? SHELL_EXIT_TIMEOUT_MS;

    if (!exitTimeoutMs || exitTimeoutMs <= 0) {
      // Dev servers never emit exit OSC. Mark background and return after a short settle.
      const backgroundPromise = this.getCurrentExecutionResult(SHELL_EXIT_TIMEOUT_MS);
      this.executionState.set({
        sessionId,
        active: true,
        background: true,
        executionPrms: backgroundPromise,
        abort,
      });
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 2_000);
      });
      return { output: '[background process started]', exitCode: 0 };
    }

    const executionPromise = this.getCurrentExecutionResult(exitTimeoutMs);
    this.executionState.set({ sessionId, active: true, executionPrms: executionPromise, abort });

    const resp = await executionPromise;
    this.executionState.set({ sessionId, active: false });

    if (resp) {
      try {
        resp.output = cleanTerminalOutput(resp.output);
      } catch (error) {
        console.log('failed to format terminal output', error);
      }

      if (resp.timedOut) {
        try {
          // Double Ctrl+C so watch-mode runners (vitest/jest) release the TTY.
          this.terminal.input('\x03');
          this.terminal.input('\x03');
          await this.waitTillOscCode('prompt', SHELL_PROMPT_TIMEOUT_MS);
        } catch {
          // ignore interrupt failures after timeout
        }
      }
    }

    return resp;
  }

  async abortCurrentExecution() {
    const state = this.executionState.get();

    if (!this.process || !this.terminal || !state?.active) {
      return;
    }

    this.terminal.input('\x03');

    try {
      await this.waitTillOscCode('prompt', SHELL_PROMPT_TIMEOUT_MS);
    } catch (error) {
      console.warn('Failed to abort current shell execution:', error);
    }

    this.executionState.set({ sessionId: state.sessionId, active: false });
  }

  async getCurrentExecutionResult(timeoutMs: number = SHELL_EXIT_TIMEOUT_MS): Promise<ExecutionResult> {
    const { output, exitCode, timedOut } = await this.waitTillOscCode('exit', timeoutMs);

    if (timedOut) {
      return {
        output: `${output}\n[shell command timed out after ${Math.round(timeoutMs / 1000)}s]`,
        exitCode: 124,
        timedOut: true,
      };
    }

    return { output, exitCode };
  }

  onQRCodeDetected?: (qrCode: string) => void;

  #notifyOutputWaiters() {
    const waiters = this.#outputWaiters.splice(0);
    for (const wake of waiters) {
      wake();
    }
  }

  #startOutputPump() {
    if (this.#outputPumpStarted || !this.#outputStream) {
      return;
    }

    this.#outputPumpStarted = true;
    const reader = this.#outputStream;

    void (async () => {
      try {
        while (true) {
          const { value, done } = await reader.read();

          if (done) {
            break;
          }

          this.#outputChunks.push(value || '');
          this.#notifyOutputWaiters();
        }
      } catch (error) {
        console.warn('Shell output pump failed:', error);
      } finally {
        this.#outputPumpDone = true;
        this.#notifyOutputWaiters();
      }
    })();
  }

  async #readOutputChunk(timeoutMs?: number): Promise<{ value?: string; done: boolean; timedOut?: boolean }> {
    this.#startOutputPump();

    if (this.#outputChunks.length > 0) {
      return { value: this.#outputChunks.shift(), done: false };
    }

    if (this.#outputPumpDone) {
      return { value: undefined, done: true };
    }

    const remaining = typeof timeoutMs === 'number' ? timeoutMs : undefined;

    await new Promise<void>((resolve) => {
      let settled = false;
      let timeoutId: ReturnType<typeof setTimeout> | undefined;

      const settle = () => {
        if (settled) {
          return;
        }

        settled = true;

        const waiterIndex = this.#outputWaiters.indexOf(settle);

        if (waiterIndex >= 0) {
          this.#outputWaiters.splice(waiterIndex, 1);
        }

        if (timeoutId) {
          clearTimeout(timeoutId);
        }

        resolve();
      };

      this.#outputWaiters.push(settle);

      if (typeof remaining === 'number') {
        if (remaining <= 0) {
          settle();
          return;
        }

        timeoutId = setTimeout(settle, remaining);
      }
    });

    if (this.#outputChunks.length > 0) {
      return { value: this.#outputChunks.shift(), done: false };
    }

    if (this.#outputPumpDone) {
      return { value: undefined, done: true };
    }

    if (typeof remaining === 'number') {
      return { value: undefined, done: false, timedOut: true };
    }

    return { value: undefined, done: false };
  }

  async waitTillOscCode(waitCode: string, timeoutMs?: number) {
    let fullOutput = '';
    let exitCode: number = 0;
    let buffer = '';

    if (!this.#outputStream) {
      return { output: fullOutput, exitCode };
    }

    const deadline = typeof timeoutMs === 'number' && timeoutMs > 0 ? Date.now() + timeoutMs : null;
    const expoUrlRegex = /(exp:\/\/[^\s]+)/;

    while (true) {
      const remaining = deadline !== null ? deadline - Date.now() : undefined;

      if (deadline !== null && remaining !== undefined && remaining <= 0) {
        return { output: fullOutput, exitCode, timedOut: true as const };
      }

      const { value, done, timedOut } = await this.#readOutputChunk(remaining);

      if (timedOut) {
        return { output: fullOutput, exitCode, timedOut: true as const };
      }

      if (done) {
        break;
      }

      const text = value || '';
      fullOutput += text;
      buffer += text;

      const expoUrlMatch = buffer.match(expoUrlRegex);

      if (expoUrlMatch) {
        const cleanUrl = expoUrlMatch[1]
          .replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '')
          .replace(/[^\x20-\x7E]+$/g, '');
        expoUrlAtom.set(cleanUrl);
        buffer = buffer.slice(buffer.indexOf(expoUrlMatch[1]) + expoUrlMatch[1].length);
      }

      const [, osc, , , code] = text.match(/\x1b\]654;([^\x07=]+)=?((-?\d+):(\d+))?\x07/) || [];

      if (osc === 'exit') {
        exitCode = parseInt(code, 10);
      }

      if (osc === waitCode) {
        break;
      }
    }

    return { output: fullOutput, exitCode };
  }
}

/**
 * Cleans and formats terminal output while preserving structure and paths
 * Handles ANSI, OSC, and various terminal control sequences
 */
export function cleanTerminalOutput(input: string): string {
  // Step 1: Remove OSC sequences (including those with parameters)
  const removeOsc = input
    .replace(/\x1b\](\d+;[^\x07\x1b]*|\d+[^\x07\x1b]*)\x07/g, '')
    .replace(/\](\d+;[^\n]*|\d+[^\n]*)/g, '');

  // Step 2: Remove ANSI escape sequences and color codes more thoroughly
  const removeAnsi = removeOsc
    // Remove all escape sequences with parameters
    .replace(/\u001b\[[\?]?[0-9;]*[a-zA-Z]/g, '')
    .replace(/\x1b\[[\?]?[0-9;]*[a-zA-Z]/g, '')
    // Remove color codes
    .replace(/\u001b\[[0-9;]*m/g, '')
    .replace(/\x1b\[[0-9;]*m/g, '')
    // Clean up any remaining escape characters
    .replace(/\u001b/g, '')
    .replace(/\x1b/g, '');

  // Step 3: Clean up carriage returns and newlines
  const cleanNewlines = removeAnsi
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\n{3,}/g, '\n\n');

  // Step 4: Add newlines at key breakpoints while preserving paths
  const formatOutput = cleanNewlines
    // Preserve prompt line
    .replace(/^([~\/][^\n❯]+)❯/m, '$1\n❯')
    // Add newline before command output indicators
    .replace(/(?<!^|\n)>/g, '\n>')
    // Add newline before error keywords without breaking paths
    .replace(/(?<!^|\n|\w)(error|failed|warning|Error|Failed|Warning):/g, '\n$1:')
    // Add newline before 'at' in stack traces without breaking paths
    .replace(/(?<!^|\n|\/)(at\s+(?!async|sync))/g, '\nat ')
    // Ensure 'at async' stays on same line
    .replace(/\bat\s+async/g, 'at async')
    // Add newline before npm error indicators
    .replace(/(?<!^|\n)(npm ERR!)/g, '\n$1');

  // Step 5: Clean up whitespace while preserving intentional spacing
  const cleanSpaces = formatOutput
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join('\n');

  // Step 6: Final cleanup
  return cleanSpaces
    .replace(/\n{3,}/g, '\n\n') // Replace multiple newlines with double newlines
    .replace(/:\s+/g, ': ') // Normalize spacing after colons
    .replace(/\s{2,}/g, ' ') // Remove multiple spaces
    .replace(/^\s+|\s+$/g, '') // Trim start and end
    .replace(/\u0000/g, ''); // Remove null characters
}

export function newBoltShellProcess() {
  return new BoltShell();
}
