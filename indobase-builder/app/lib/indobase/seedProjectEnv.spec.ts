import { describe, expect, it } from 'vitest';

import { buildProjectEnvContent, seedProjectEnvIfMissing } from './seedProjectEnv';

describe('seedProjectEnv', () => {
  it('writes .env only when the file is missing', async () => {
    const files = new Map<string, string>();
    const connection = {
      credentials: {
        anonKey: 'anon-key',
        supabaseUrl: 'https://proj_123.indobase.in',
      },
      indobase: {
        projectRef: 'proj_123',
      },
    } as any;

    const wrote = await seedProjectEnvIfMissing(
      async (path, content) => {
        files.set(path, content);
      },
      async (path) => {
        const content = files.get(path);
        if (!content) {
          throw new Error('missing');
        }
        return content;
      },
      connection,
    );

    expect(wrote).toBe(true);
    expect(files.get('.env')).toContain('VITE_INDOBASE_URL=https://proj_123.indobase.in');

    const wroteAgain = await seedProjectEnvIfMissing(
      async (path, content) => {
        files.set(path, content);
      },
      async (path) => {
        const content = files.get(path);
        if (!content) {
          throw new Error('missing');
        }
        return content;
      },
      connection,
    );

    expect(wroteAgain).toBe(false);
  });

  it('returns null env content without credentials', () => {
    expect(buildProjectEnvContent(null)).toBeNull();
  });
});
