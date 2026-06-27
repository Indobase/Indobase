import { describe, expect, it } from 'vitest';

import { signIndobaseBuilderMcpToken } from '~/lib/indobase/handoff.server';
import type { IndobaseBuilderHandoffPayload } from '~/types/indobase';
import { verifyBuilderRequestAuth } from './builder-auth.server';

const TEST_SECRET = 'test-builder-handoff-secret-32chars-min';

const handoffPayload: IndobaseBuilderHandoffPayload = {
  aud: 'indobase-builder',
  backend: {
    anon_key: 'anon',
    api_url: 'https://example.indobase.in',
    auth_url: 'https://example.indobase.in/auth/v1',
    project_name: 'Demo',
    project_ref: 'demo-ref',
    project_url: 'https://demo-ref.indobase.in',
    public_env: {
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon',
      NEXT_PUBLIC_SUPABASE_URL: 'https://demo-ref.indobase.in',
      SUPABASE_ANON_KEY: 'anon',
      SUPABASE_URL: 'https://demo-ref.indobase.in',
    },
    rest_url: 'https://demo-ref.indobase.in/rest/v1',
    storage_url: 'https://demo-ref.indobase.in/storage/v1',
  },
  email: 'builder@indobase.in',
  exp: Math.floor(Date.now() / 1000) + 3600,
  iat: Math.floor(Date.now() / 1000),
  iss: 'https://studio.indobase.in',
  organization_slug: 'acme',
  project_name: 'Demo',
  project_ref: 'demo-ref',
  studio_url: 'https://studio.indobase.in',
  sub: 'user-1',
};

describe('verifyBuilderRequestAuth', () => {
  it('accepts MCP cookie when secret is provided via server env', async () => {
    const env = { BUILDER_HANDOFF_SECRET: TEST_SECRET };
    const token = signIndobaseBuilderMcpToken(handoffPayload, 3600, env);
    const request = new Request('https://builder.indobase.in/api/chat', {
      method: 'POST',
      headers: {
        Cookie: `indobase_builder_mcp=${token}`,
      },
    });

    await expect(verifyBuilderRequestAuth(request, env)).resolves.toBe(true);
  });

  it('rejects MCP cookie when server env secret is missing', async () => {
    const env = { BUILDER_HANDOFF_SECRET: TEST_SECRET };
    const token = signIndobaseBuilderMcpToken(handoffPayload, 3600, env);
    const request = new Request('https://builder.indobase.in/api/chat', {
      method: 'POST',
      headers: {
        Cookie: `indobase_builder_mcp=${token}`,
      },
    });

    await expect(verifyBuilderRequestAuth(request, {})).resolves.toBe(false);
  });

  it('falls back to a valid MCP cookie when the bearer token is expired', async () => {
    const env = { BUILDER_HANDOFF_SECRET: TEST_SECRET };
    const expiredHandoff: IndobaseBuilderHandoffPayload = {
      ...handoffPayload,
      exp: Math.floor(Date.now() / 1000) - 60,
      iat: Math.floor(Date.now() / 1000) - 3600,
    };
    const validToken = signIndobaseBuilderMcpToken(handoffPayload, 3600, env);
    const expiredToken = signIndobaseBuilderMcpToken(expiredHandoff, 3600, env);
    const request = new Request('https://builder.indobase.in/api/chat', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${expiredToken}`,
        Cookie: `indobase_builder_mcp=${validToken}`,
      },
    });

    await expect(verifyBuilderRequestAuth(request, env)).resolves.toBe(true);
  });
});
