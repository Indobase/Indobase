import { describe, expect, it, vi } from 'vitest';
import crypto from 'node:crypto';

import { buildIndobaseConnectionFromHandoff } from './handoff';
import {
  signIndobaseBuilderMcpToken,
  verifyIndobaseBuilderMcpToken,
  verifyIndobaseStudioHandoff,
} from './handoff.server';
import type { IndobaseBuilderHandoffPayload } from '~/types/indobase';
import { getAutoIndobaseMcpConfig, mergeMcpConfigWithIndobase } from './mcp';

function createStudioStyleToken(payload: IndobaseBuilderHandoffPayload, secret: string) {
  const encode = (value: string) =>
    Buffer.from(value).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

  const header = encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = encode(JSON.stringify(payload));
  const data = `${header}.${body}`;
  const signature = crypto
    .createHmac('sha256', secret)
    .update(data)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  return `${data}.${signature}`;
}

describe('indobase handoff', () => {
  const payload: IndobaseBuilderHandoffPayload = {
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
    email: 'user@example.com',
    exp: Math.floor(Date.now() / 1000) + 300,
    iat: Math.floor(Date.now() / 1000),
    iss: 'https://studio.indobase.in',
    organization_slug: 'my-org',
    project_name: 'My Project',
    project_ref: 'proj_123',
    studio_url: 'https://studio.indobase.in',
    sub: 'user-123',
  };

  it('maps handoff payload into the Indobase connection store shape', () => {
    const connection = buildIndobaseConnectionFromHandoff(payload, { mcpToken: 'mcp-token' });

    expect(connection).toMatchObject({
      selectedProjectId: 'proj_123',
      isConnected: true,
      connectionSource: 'studio_handoff',
      project: {
        id: 'proj_123',
        name: 'My Project',
      },
      credentials: {
        anonKey: 'anon-key',
        apiUrl: 'https://proj_123.indobase.in',
      },
      indobase: {
        mcpToken: 'mcp-token',
        projectUrl: 'https://studio.indobase.in/project/proj_123/backend',
      },
    });
  });

  it('verifies Studio-signed handoff tokens from Remix load context env', async () => {
    const secret = 'super-secret-builder-token-with-at-least-32-characters';
    vi.unstubAllEnvs();
    delete process.env.BUILDER_HANDOFF_SECRET;

    const token = createStudioStyleToken(payload, secret);
    const verified = await verifyIndobaseStudioHandoff(token, { BUILDER_HANDOFF_SECRET: secret });

    expect(verified.project_ref).toBe('proj_123');
  });

  it('verifies Studio-signed handoff tokens', async () => {
    const secret = 'super-secret-builder-token-with-at-least-32-characters';
    vi.stubEnv('BUILDER_HANDOFF_SECRET', secret);

    const token = createStudioStyleToken(payload, secret);
    const verified = await verifyIndobaseStudioHandoff(token);

    expect(verified).toMatchObject({
      aud: 'indobase-builder',
      project_ref: 'proj_123',
      backend: {
        api_url: 'https://proj_123.indobase.in',
      },
    });
  });

  it('signs and verifies Builder MCP tokens', async () => {
    const secret = 'super-secret-builder-token-with-at-least-32-characters';
    vi.stubEnv('BUILDER_HANDOFF_SECRET', secret);

    const token = signIndobaseBuilderMcpToken(payload, 60);
    const verified = await verifyIndobaseBuilderMcpToken(token);

    expect(verified).toMatchObject({
      aud: 'indobase-builder-mcp',
      project_ref: 'proj_123',
      sub: 'user-123',
    });
  });

  it('auto-registers the Indobase MCP server for Studio handoff sessions', () => {
    const connection = buildIndobaseConnectionFromHandoff(payload, { mcpToken: 'mcp-token' });
    const autoConfig = getAutoIndobaseMcpConfig(connection as any);
    const merged = mergeMcpConfigWithIndobase(
      {
        mcpServers: {
          example: {
            type: 'streamable-http',
            url: 'https://example.com/mcp',
          },
        },
      },
      connection as any,
    );

    expect(autoConfig).toEqual({
      mcpServers: {
        indobase: {
          type: 'streamable-http',
          url: 'https://studio.indobase.in/api/mcp?project_ref=proj_123',
          headers: {
            Authorization: 'Bearer mcp-token',
          },
        },
      },
    });
    expect(merged.mcpServers).toMatchObject({
      example: {
        type: 'streamable-http',
        url: 'https://example.com/mcp',
      },
      indobase: {
        type: 'streamable-http',
        url: 'https://studio.indobase.in/api/mcp?project_ref=proj_123',
      },
    });
  });
});
