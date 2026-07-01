import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  buildBuilderBackendConfig,
  buildBuilderLaunchUrl,
  getStudioOrigin,
  makeBuilderHandoffToken,
  resolveBuilderBaseUrl,
  resolveBuilderHandoffSecret,
} from './builder-launch'
import type { ProjectSettings } from './settings'

function decodeJwtPayload(token: string) {
  const [, payload] = token.split('.')
  return JSON.parse(Buffer.from(payload!, 'base64url').toString('utf8'))
}

describe('builder-launch', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('prefers explicit builder base URL env', () => {
    vi.stubEnv('BUILDER_APP_URL', 'https://builder.indobase.in/')
    expect(resolveBuilderBaseUrl()).toBe('https://builder.indobase.in')
  })

  it('falls back to NEXT_PUBLIC_SITE_URL for studio origin', () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://studio.indobase.in')
    expect(getStudioOrigin()).toBe('https://studio.indobase.in')
  })

  it('builds a launch URL with handoff token and project ref', () => {
    expect(
      buildBuilderLaunchUrl({
        baseUrl: 'https://builder.indobase.in',
        handoffToken: 'abc.def.ghi',
        projectRef: 'proj_123',
      })
    ).toBe('https://builder.indobase.in/launch?token=abc.def.ghi&handoff=abc.def.ghi&project_ref=proj_123')
  })

  it('builds public backend config for Builder bootstrapping', () => {
    const backend = buildBuilderBackendConfig({
      projectName: 'My Project',
      projectRef: 'proj_123',
      settings: {
        app_config: {
          endpoint: 'proj_123.indobase.in',
          protocol: 'https',
        },
        service_api_keys: [
          { api_key: 'service-role-key', name: 'service_role key', tags: 'service_role' },
          { api_key: 'anon-key', name: 'anon key', tags: 'anon' },
        ],
      } as ProjectSettings,
      studioUrl: 'https://studio.indobase.in',
    })

    expect(backend).toMatchObject({
      api_url: 'https://proj_123.indobase.in',
      auth_url: 'https://proj_123.indobase.in/auth/v1',
      rest_url: 'https://proj_123.indobase.in/rest/v1/',
      storage_url: 'https://proj_123.indobase.in/storage/v1',
      project_url: 'https://studio.indobase.in/project/proj_123/backend',
      public_env: {
        VITE_INDOBASE_URL: 'https://proj_123.indobase.in',
        VITE_INDOBASE_ANON_KEY: 'anon-key',
        NEXT_PUBLIC_SUPABASE_URL: 'https://proj_123.indobase.in',
        NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key',
        SUPABASE_URL: 'https://proj_123.indobase.in',
        SUPABASE_ANON_KEY: 'anon-key',
      },
    })
  })

  it('signs the builder handoff token with project context', () => {
    const token = makeBuilderHandoffToken(
      {
        anonKey: 'anon-key',
        aud: 'indobase-builder',
        backend: {
          anon_key: 'anon-key',
          api_url: 'https://proj_123.indobase.in',
          auth_url: 'https://proj_123.indobase.in/auth/v1',
          project_name: 'My Project',
          project_ref: 'proj_123',
          project_url: 'https://studio.indobase.in/project/proj_123/backend',
          public_env: {
            NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key',
            NEXT_PUBLIC_SUPABASE_URL: 'https://proj_123.indobase.in',
            SUPABASE_ANON_KEY: 'anon-key',
            SUPABASE_URL: 'https://proj_123.indobase.in',
          },
          rest_url: 'https://proj_123.indobase.in/rest/v1/',
          storage_url: 'https://proj_123.indobase.in/storage/v1',
        },
        dbUrl: 'postgresql://postgres:secret@db.indobase.internal:5432/postgres',
        email: 'user@example.com',
        exp: 200,
        iat: 100,
        iss: 'https://studio.indobase.in',
        orgId: 42,
        organization_slug: 'my-org',
        project_name: 'My Project',
        project_ref: 'proj_123',
        projectRef: 'proj_123',
        studio_url: 'https://studio.indobase.in',
        sub: 'user-123',
        userId: 'user-123',
      },
      'super-secret-builder-token-with-at-least-32-characters'
    )

    expect(token.split('.')).toHaveLength(3)
    expect(decodeJwtPayload(token)).toMatchObject({
      anonKey: 'anon-key',
      aud: 'indobase-builder',
      backend: {
        api_url: 'https://proj_123.indobase.in',
        public_env: {
          NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key',
        },
      },
      dbUrl: 'postgresql://postgres:secret@db.indobase.internal:5432/postgres',
      orgId: 42,
      organization_slug: 'my-org',
      project_ref: 'proj_123',
      projectRef: 'proj_123',
      sub: 'user-123',
      userId: 'user-123',
    })
  })

  it('requires a sufficiently long builder secret', () => {
    vi.stubEnv('BUILDER_HANDOFF_SECRET', 'too-short')
    vi.stubEnv('AUTH_JWT_SECRET', '')
    vi.stubEnv('JWT_SECRET', '')
    expect(() => resolveBuilderHandoffSecret()).toThrow(
      'Missing/invalid builder handoff secret (must be >= 32 chars)'
    )
  })
})
