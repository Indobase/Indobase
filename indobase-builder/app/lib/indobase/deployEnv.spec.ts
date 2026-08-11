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
        apiUrl: 'https://proj_123.indobase.in',
      },
      indobase: {
        projectRef: 'proj_123',
        studioUrl: 'https://studio.indobase.in',
      } as any,
    });

    expect(env).toEqual({
      NEXT_PUBLIC_INDOBASE_ANON_KEY: 'anon-key',
      NEXT_PUBLIC_INDOBASE_URL: 'https://proj_123.indobase.in',
      INDOBASE_ANON_KEY: 'anon-key',
      INDOBASE_URL: 'https://proj_123.indobase.in',
      VITE_INDOBASE_ANON_KEY: 'anon-key',
      VITE_INDOBASE_URL: 'https://proj_123.indobase.in',
      EXPO_PUBLIC_INDOBASE_ANON_KEY: 'anon-key',
      EXPO_PUBLIC_INDOBASE_URL: 'https://proj_123.indobase.in',
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
          apiUrl: 'https://proj_123.indobase.in',
        },
      } as any),
    ).toBe(true);
  });

  it('derives Indobase backend env vars from a managed backend connection', () => {
    const env = getDeployEnvironmentVariables({
      backendProvider: 'pocketbase',
      connectionSource: 'pocketbase',
      pocketbase: { url: 'http://127.0.0.1:8090' },
    });

    expect(env).toEqual({
      INDOBASE_URL: 'http://127.0.0.1:8090',
      VITE_INDOBASE_URL: 'http://127.0.0.1:8090',
      NEXT_PUBLIC_INDOBASE_URL: 'http://127.0.0.1:8090',
      EXPO_PUBLIC_INDOBASE_URL: 'http://127.0.0.1:8090',
    });
    expect(
      hasDeployEnvironmentVariables({
        backendProvider: 'pocketbase',
        connectionSource: 'pocketbase',
        pocketbase: { url: 'http://127.0.0.1:8090' },
      }),
    ).toBe(true);
  });

  it('ignores blank values from partial connection state', () => {
    const env = getDeployEnvironmentVariables({
      credentials: {
        anonKey: '   ',
        apiUrl: 'https://proj_123.indobase.in',
      },
      indobase: {
        projectRef: '   ',
        studioUrl: 'https://studio.indobase.in',
      } as any,
    });

    expect(env).toEqual({});
  });
});
