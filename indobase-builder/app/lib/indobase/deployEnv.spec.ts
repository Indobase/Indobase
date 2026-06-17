import { describe, expect, it } from 'vitest';

import { getDeployEnvironmentVariables, hasDeployEnvironmentVariables } from './deployEnv';

describe('deploy environment variables', () => {
  it('returns an empty object when no backend credentials are available', () => {
    expect(getDeployEnvironmentVariables()).toEqual({});
    expect(hasDeployEnvironmentVariables()).toBe(false);
  });

  it('derives common framework env vars from the active backend connection', () => {
    const env = getDeployEnvironmentVariables({
      credentials: {
        anonKey: 'anon-key',
        supabaseUrl: 'https://proj_123.indobase.in',
      },
      indobase: {
        projectRef: 'proj_123',
        studioUrl: 'https://studio.indobase.in',
      } as any,
    });

    expect(env).toEqual({
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key',
      NEXT_PUBLIC_SUPABASE_URL: 'https://proj_123.indobase.in',
      SUPABASE_ANON_KEY: 'anon-key',
      SUPABASE_URL: 'https://proj_123.indobase.in',
      VITE_SUPABASE_ANON_KEY: 'anon-key',
      VITE_SUPABASE_URL: 'https://proj_123.indobase.in',
      INDOBASE_PROJECT_REF: 'proj_123',
      NEXT_PUBLIC_INDOBASE_PROJECT_REF: 'proj_123',
      VITE_INDOBASE_PROJECT_REF: 'proj_123',
      INDOBASE_STUDIO_URL: 'https://studio.indobase.in',
      NEXT_PUBLIC_INDOBASE_STUDIO_URL: 'https://studio.indobase.in',
      VITE_INDOBASE_STUDIO_URL: 'https://studio.indobase.in',
    });
    expect(
      hasDeployEnvironmentVariables({
        credentials: {
          anonKey: 'anon-key',
          supabaseUrl: 'https://proj_123.indobase.in',
        },
      } as any),
    ).toBe(true);
  });

  it('ignores blank values from partial connection state', () => {
    const env = getDeployEnvironmentVariables({
      credentials: {
        anonKey: '   ',
        supabaseUrl: 'https://proj_123.indobase.in',
      },
      indobase: {
        projectRef: '   ',
        studioUrl: 'https://studio.indobase.in',
      } as any,
    });

    expect(env).toEqual({});
  });
});
