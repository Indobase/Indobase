import type { WebContainer } from '@webcontainer/api';
import { describe, expect, it, vi } from 'vitest';
import { ActionRunner } from './action-runner';

describe('ActionRunner start actions', () => {
  it('does not complete until WebContainer reports a preview port', async () => {
    vi.useFakeTimers();

    const listeners = new Map<string, (...args: any[]) => void>();
    const container = {
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
});
