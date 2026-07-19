import type { WebContainer } from '@webcontainer/api';
import { describe, expect, it, vi } from 'vitest';
import { ActionRunner } from './action-runner';

function createStartContainer(overrides?: Partial<WebContainer>) {
  const listeners = new Map<string, (...args: any[]) => void>();

  return {
    listeners,
    container: {
      getPorts: vi.fn().mockResolvedValue([]),
      fs: {
        readdir: vi.fn(async (path: string) => {
          if (path === 'node_modules/.bin') {
            return [{ name: 'vite' }];
          }

          return [];
        }),
        readFile: vi.fn(async (path: string) => {
          if (path === 'package.json') {
            return JSON.stringify({
              scripts: { dev: 'vite' },
              devDependencies: { vite: '^6.0.0' },
            });
          }

          throw new Error(`missing ${path}`);
        }),
      },
      spawn: vi.fn(),
      on: vi.fn((event: string, listener: (...args: any[]) => void) => {
        listeners.set(event, listener);
      }),
      ...overrides,
    } as unknown as WebContainer,
  };
}

describe('ActionRunner start actions', () => {
  it('does not complete until WebContainer reports a preview port', async () => {
    vi.useFakeTimers();

    const { container, listeners } = createStartContainer();
    const shell = {
      ready: vi.fn().mockResolvedValue(undefined),
      terminal: {},
      process: {},
      executeCommand: vi.fn().mockResolvedValue({ exitCode: 0, output: '' }),
    };
    const runner = new ActionRunner(Promise.resolve(container), () => shell as any);
    const action = {
      messageId: 'message',
      artifactId: 'artifact',
      actionId: 'start',
      action: { type: 'start' as const, content: 'npm run dev' },
    };

    runner.addAction(action);

    let completed = false;
    const execution = runner.runAction(action).then(() => {
      completed = true;
    });

    await vi.advanceTimersByTimeAsync(1);
    expect(completed).toBe(false);
    expect(runner.actions.get().start.status).toBe('running');

    listeners.get('port')?.(5173, 'open', 'https://preview.local');
    await execution;

    expect(runner.actions.get().start.status).toBe('complete');
    vi.useRealTimers();
  });

  it('still starts Vite when generated source has a syntax error (health gating is in finalizeCodegen)', async () => {
    const { container, listeners } = createStartContainer({
      fs: {
        readdir: vi.fn(async (path: string) => {
          if (path === 'node_modules/.bin') {
            return [{ name: 'vite' }];
          }

          if (path === '.') {
            return ['src'];
          }

          if (path === 'src') {
            return ['Services.jsx'];
          }

          throw new Error('not a directory');
        }),
        readFile: vi.fn(async (path: string) => {
          if (path === 'package.json') {
            return JSON.stringify({
              scripts: { dev: 'vite' },
              devDependencies: { vite: '^6.0.0' },
            });
          }

          return 'export function Services() {}\nreturn <section />';
        }),
      } as any,
    });
    const shell = {
      ready: vi.fn().mockResolvedValue(undefined),
      terminal: {},
      process: {},
      executeCommand: vi.fn().mockResolvedValue({ exitCode: 0, output: '' }),
    };
    const runner = new ActionRunner(Promise.resolve(container), () => shell as any);
    const action = {
      messageId: 'message',
      artifactId: 'artifact',
      actionId: 'start-invalid',
      action: { type: 'start' as const, content: 'npm run dev' },
    };

    runner.addAction(action);

    const execution = runner.runAction(action);
    await vi.waitFor(() => expect(shell.executeCommand).toHaveBeenCalled());

    listeners.get('port')?.(5173, 'open', 'https://preview.local');
    await execution;

    expect(runner.actions.get()['start-invalid']).toMatchObject({
      status: 'complete',
    });
  });

  it('installs toolchain before npm run dev when vite binary is missing', async () => {
    let ready = false;
    const listeners = new Map<string, (...args: any[]) => void>();
    const container = {
      getPorts: vi.fn().mockResolvedValue([]),
      fs: {
        readdir: vi.fn(async (path: string) => {
          if (path === 'node_modules/.bin') {
            return ready ? [{ name: 'vite' }] : [];
          }

          return [];
        }),
        readFile: vi.fn(async (path: string) => {
          if (path === 'package.json') {
            return JSON.stringify({
              scripts: { dev: 'vite' },
              devDependencies: { vite: '^6.0.0' },
            });
          }

          throw new Error(`missing ${path}`);
        }),
      },
      spawn: vi.fn(async () => {
        ready = true;

        return {
          exit: Promise.resolve(0),
          output: { pipeTo: async () => undefined },
        };
      }),
      on: vi.fn((event: string, listener: (...args: any[]) => void) => {
        listeners.set(event, listener);
      }),
    } as unknown as WebContainer;

    const shell = {
      ready: vi.fn().mockResolvedValue(undefined),
      terminal: {},
      process: {},
      executeCommand: vi.fn().mockResolvedValue({ exitCode: 0, output: '' }),
    };
    const runner = new ActionRunner(Promise.resolve(container), () => shell as any);
    const action = {
      messageId: 'message',
      artifactId: 'artifact',
      actionId: 'start-install',
      action: { type: 'start' as const, content: 'npm run dev' },
    };

    runner.addAction(action);

    const execution = runner.runAction(action);
    await vi.waitFor(() => expect(container.spawn).toHaveBeenCalled());
    await vi.waitFor(() => expect(shell.executeCommand).toHaveBeenCalled());

    listeners.get('port')?.(5173, 'open', 'https://preview.local');
    await execution;

    expect(container.spawn).toHaveBeenCalledWith('npm', expect.arrayContaining(['install', '--include=dev']));
    expect(runner.actions.get()['start-install']).toMatchObject({ status: 'complete' });
  });
});
