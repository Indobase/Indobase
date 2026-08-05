import { describe, expect, it } from 'vitest';

import { buildHostedBuildChildEnv } from './hosted-build-env.server';
import {
  getHostedBuildQueueStats,
  setHostedBuildConcurrency,
  withHostedBuildSlot,
} from './hosted-build-queue.server';

describe('buildHostedBuildChildEnv', () => {
  it('does not leak arbitrary host secrets into the child env', () => {
    const prev = (globalThis as { process?: { env?: Record<string, string> } }).process?.env;
    const processRef = (globalThis as { process?: { env?: Record<string, string> } }).process;

    if (processRef) {
      processRef.env = {
        ...(prev ?? {}),
        PATH: '/usr/local/bin:/usr/bin',
        HOME: '/root',
        OPEN_ROUTER_API_KEY: 'sk-secret',
        BUILDER_HANDOFF_SECRET: 'super-secret-handoff-key-32chars!!',
        WEBCONTAINER_API_KEY: 'wc_api_secret',
        DATABASE_URL: 'postgres://x',
      };
    }

    const env = buildHostedBuildChildEnv({
      workDir: '/tmp/indobase-build-xyz',
      npmCacheDir: '/tmp/indobase-npm-cache',
    });

    expect(env.OPEN_ROUTER_API_KEY).toBeUndefined();
    expect(env.BUILDER_HANDOFF_SECRET).toBeUndefined();
    expect(env.WEBCONTAINER_API_KEY).toBeUndefined();
    expect(env.DATABASE_URL).toBeUndefined();
    expect(env.HOME).toBe('/tmp/indobase-build-xyz');
    expect(env.npm_config_cache).toBe('/tmp/indobase-npm-cache');
    expect(env.CI).toBe('true');
    expect(env.NODE_ENV).toBe('development');

    if (processRef && prev) {
      processRef.env = prev;
    }
  });
});

describe('withHostedBuildSlot', () => {
  it('limits concurrency', async () => {
    setHostedBuildConcurrency(2);
    let maxActive = 0;
    let current = 0;

    const tasks = Array.from({ length: 5 }, () =>
      withHostedBuildSlot(async () => {
        current += 1;
        maxActive = Math.max(maxActive, current);
        await new Promise((r) => setTimeout(r, 30));
        current -= 1;
      }),
    );

    await Promise.all(tasks);
    expect(maxActive).toBeLessThanOrEqual(2);
    expect(getHostedBuildQueueStats().active).toBe(0);
  });
});
