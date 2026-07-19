import { describe, expect, it, vi } from 'vitest';
import { ensureNpmDependencies, isDevStartCommand, isToolchainReady } from './ensureNpmDependencies';

describe('isDevStartCommand', () => {
  it('detects common preview start commands', () => {
    expect(isDevStartCommand('npm run dev')).toBe(true);
    expect(isDevStartCommand('npm run start')).toBe(true);
    expect(isDevStartCommand('pnpm run preview')).toBe(true);
    expect(isDevStartCommand('vite --host')).toBe(true);
    expect(isDevStartCommand('npx vite')).toBe(true);
  });

  it('ignores unrelated shell commands', () => {
    expect(isDevStartCommand('npm install')).toBe(false);
    expect(isDevStartCommand('ls')).toBe(false);
    expect(isDevStartCommand('npm run build')).toBe(false);
  });
});

describe('isToolchainReady / ensureNpmDependencies', () => {
  it('requires a toolchain binary under node_modules/.bin', async () => {
    const container = {
      fs: {
        readdir: vi.fn(async () => [{ name: 'esbuild' }]),
        readFile: vi.fn(),
      },
      spawn: vi.fn(),
    };

    await expect(isToolchainReady(container as any)).resolves.toBe(false);

    container.fs.readdir = vi.fn(async () => [{ name: 'vite' }]);
    await expect(isToolchainReady(container as any)).resolves.toBe(true);
  });

  it('installs when package.json exists but vite is missing, then verifies binary', async () => {
    let ready = false;
    const container = {
      fs: {
        readFile: vi.fn(async () => '{}'),
        readdir: vi.fn(async () => (ready ? [{ name: 'vite' }] : [])),
      },
      spawn: vi.fn(async () => {
        ready = true;

        return {
          exit: Promise.resolve(0),
          output: {
            pipeTo: async () => undefined,
          },
        };
      }),
    };

    const result = await ensureNpmDependencies(container as any);

    expect(result.success).toBe(true);
    expect(container.spawn).toHaveBeenCalledWith(
      'npm',
      expect.arrayContaining(['install', '--include=dev']),
    );
  });

  it('fails clearly when install exits 0 but vite is still missing', async () => {
    const container = {
      fs: {
        readFile: vi.fn(async () => '{}'),
        readdir: vi.fn(async () => []),
      },
      spawn: vi.fn(async () => ({
        exit: Promise.resolve(0),
        output: {
          pipeTo: async () => undefined,
        },
      })),
    };

    const result = await ensureNpmDependencies(container as any);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/vite/i);
  });
});
