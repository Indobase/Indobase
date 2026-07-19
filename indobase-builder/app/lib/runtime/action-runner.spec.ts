import type { WebContainer } from '@webcontainer/api';
import { describe, expect, it, vi } from 'vitest';
import { ActionRunner } from './action-runner';

describe('ActionRunner start actions', () => {
  it('does not complete until WebContainer reports a preview port', async () => {
    vi.useFakeTimers();

    const listeners = new Map<string, (...args: any[]) => void>();
    const container = {
      getPorts: vi.fn().mockResolvedValue([]),
      fs: {
        readdir: vi.fn().mockResolvedValue([]),
        readFile: vi.fn(),
      },
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
    const listeners = new Map<string, (...args: any[]) => void>();
    const container = {
      fs: {
        readdir: vi.fn(async (path: string) => {
          if (path === '.') {
            return ['src'];
          }

          if (path === 'src') {
            return ['Services.jsx'];
          }

          throw new Error('not a directory');
        }),
        readFile: vi.fn(async () => 'export function Services() {}\nreturn <section />'),
      },
      getPorts: vi.fn().mockResolvedValue([]),
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
});
