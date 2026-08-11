import crypto from 'node:crypto';
import { jwtVerify } from 'jose';
import { z } from 'zod';

import { BUILDER_MCP_TOKEN_TTL_SECONDS } from '~/lib/indobase/builder-session.constants';
import type { IndobaseBuilderHandoffPayload, IndobaseBuilderMcpTokenPayload } from '~/types/indobase';

const handoffSchema = z.object({
  aud: z.literal('indobase-builder'),
  backend: z.object({
    anon_key: z.string().min(1),
    api_url: z.string().url(),
    auth_url: z.string().url(),
    project_name: z.string().min(1),
    project_ref: z.string().min(1),
    project_url: z.string().url(),
    public_env: z
      .object({
        INDOBASE_ANON_KEY: z.string().min(1).optional(),
        INDOBASE_URL: z.string().url().optional(),
        NEXT_PUBLIC_INDOBASE_ANON_KEY: z.string().min(1).optional(),
        NEXT_PUBLIC_INDOBASE_URL: z.string().url().optional(),
        VITE_INDOBASE_ANON_KEY: z.string().min(1).optional(),
        VITE_INDOBASE_URL: z.string().url().optional(),
        EXPO_PUBLIC_INDOBASE_ANON_KEY: z.string().min(1).optional(),
        EXPO_PUBLIC_INDOBASE_URL: z.string().url().optional(),
        NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1).optional(),
        NEXT_PUBLIC_SUPABASE_URL: z.string().url().optional(),
        SUPABASE_ANON_KEY: z.string().min(1).optional(),
        SUPABASE_URL: z.string().url().optional(),
        VITE_SUPABASE_ANON_KEY: z.string().min(1).optional(),
        VITE_SUPABASE_URL: z.string().url().optional(),
      })
      .passthrough(),
    rest_url: z.string().url(),
    storage_url: z.string().url(),
  }),
  email: z.string().email(),
  exp: z.number(),
  iat: z.number(),
  iss: z.string().url(),
  organization_slug: z.string().min(1),
  project_name: z.string().min(1),
  project_ref: z.string().min(1),
  studio_url: z.string().url(),
  sub: z.string().min(1),
});

const mcpTokenSchema = z.object({
  aud: z.literal('indobase-builder-mcp'),
  email: z.string().email(),
  exp: z.number(),
  iat: z.number(),
  iss: z.string().url(),
  organization_slug: z.string().min(1),
  project_ref: z.string().min(1),
  studio_url: z.string().url(),
  sub: z.string().min(1),
});

function base64Url(input: Buffer | string) {
  const buf = typeof input === 'string' ? Buffer.from(input) : input;
  return buf.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

type ServerEnv = Record<string, string | undefined>;

function resolveBuilderHandoffSecret(env?: ServerEnv) {
  const secret =
    env?.BUILDER_HANDOFF_SECRET?.trim() ||
    process.env.BUILDER_HANDOFF_SECRET?.trim() ||
    env?.BUILDER_CFOS_HANDOFF_SECRET?.trim() ||
    process.env.BUILDER_CFOS_HANDOFF_SECRET?.trim() ||
    env?.AUTH_JWT_SECRET?.trim() ||
    process.env.AUTH_JWT_SECRET?.trim() ||
    env?.JWT_SECRET?.trim() ||
    process.env.JWT_SECRET?.trim() ||
    '';

  if (secret.length < 32) {
    throw new Error('Missing/invalid Builder handoff secret');
  }

  return secret;
}

export function signIndobaseBuilderMcpToken(
  payload: IndobaseBuilderHandoffPayload,
  expiresInSeconds: number = BUILDER_MCP_TOKEN_TTL_SECONDS,
  env?: ServerEnv,
): string {
  const now = Math.floor(Date.now() / 1000);
  const tokenPayload: IndobaseBuilderMcpTokenPayload = {
    aud: 'indobase-builder-mcp',
    email: payload.email,
    exp: now + expiresInSeconds,
    iat: now,
    iss: payload.iss,
    organization_slug: payload.organization_slug,
    project_ref: payload.project_ref,
    studio_url: payload.studio_url,
    sub: payload.sub,
  };

  const headerB64 = base64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payloadB64 = base64Url(JSON.stringify(tokenPayload));
  const data = `${headerB64}.${payloadB64}`;
  const signature = crypto.createHmac('sha256', resolveBuilderHandoffSecret(env)).update(data).digest();

  return `${data}.${base64Url(signature)}`;
}

export async function verifyIndobaseStudioHandoff(
  token: string,
  env?: ServerEnv,
): Promise<IndobaseBuilderHandoffPayload> {
  const secret = new TextEncoder().encode(resolveBuilderHandoffSecret(env));
  const { payload } = await jwtVerify(token, secret, {
    algorithms: ['HS256'],
    audience: 'indobase-builder',
  });

  return handoffSchema.parse(payload) as IndobaseBuilderHandoffPayload;
}

export async function verifyIndobaseBuilderMcpToken(
  token: string,
  env?: ServerEnv,
): Promise<IndobaseBuilderMcpTokenPayload> {
  const secret = new TextEncoder().encode(resolveBuilderHandoffSecret(env));
  const { payload } = await jwtVerify(token, secret, {
    algorithms: ['HS256'],
    audience: 'indobase-builder-mcp',
  });

  return mcpTokenSchema.parse(payload) as IndobaseBuilderMcpTokenPayload;
}
