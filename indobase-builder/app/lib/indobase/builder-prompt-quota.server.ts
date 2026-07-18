import { json } from '@remix-run/node';

import { parseCookies } from '~/lib/api/cookies';
import { readBearerToken, resolveValidBuilderMcpToken } from '~/lib/indobase/builder-auth.server';
import { verifyIndobaseBuilderMcpToken } from '~/lib/indobase/handoff.server';
import { resolveStudioServerFetchBase } from '~/lib/indobase/studio-server-url.server';
import type { IndobaseBuilderMcpTokenPayload } from '~/types/indobase';
import type { BuilderPromptQuotaState } from '~/types/builder-quota';

export type { BuilderPromptQuotaState };

const BUILDER_MCP_COOKIE = 'indobase_builder_mcp';

type ServerEnv = Record<string, string | undefined>;

export function isAutonomousRepairChat(messages: Array<{ role: string; content: unknown }>): boolean {
  const lastUser = [...messages].reverse().find((message) => message.role === 'user');

  if (!lastUser) {
    return false;
  }

  const content = String(lastUser.content);
  return content.includes('[Orchestrator Agent]');
}

export function shouldConsumeBuilderPrompt(
  _chatMode: 'discuss' | 'build' | undefined,
  messages: Array<{ role: string; content: unknown }>,
): boolean {
  return !isAutonomousRepairChat(messages);
}

export async function resolveBuilderMcpClaims(
  request: Request,
  env?: ServerEnv,
): Promise<IndobaseBuilderMcpTokenPayload | null> {
  const cookies = parseCookies(request.headers.get('Cookie'));
  const token = await resolveValidBuilderMcpToken(
    [readBearerToken(request), cookies[BUILDER_MCP_COOKIE]],
    env,
  );

  if (!token) {
    return null;
  }

  try {
    return await verifyIndobaseBuilderMcpToken(token, env);
  } catch {
    return null;
  }
}

async function fetchStudioPromptQuota(options: {
  studioUrl: string;
  projectRef: string;
  mcpToken: string;
  method: 'GET' | 'POST';
}): Promise<Response> {
  const endpoint = new URL(
    `/api/platform/projects/${encodeURIComponent(options.projectRef)}/builder/prompt-quota`,
    options.studioUrl,
  );

  return fetch(endpoint.toString(), {
    method: options.method,
    headers: {
      Authorization: `Bearer ${options.mcpToken}`,
      Accept: 'application/json',
    },
  });
}

export async function getBuilderPromptQuotaFromStudio(
  request: Request,
  env?: ServerEnv,
): Promise<BuilderPromptQuotaState | null> {
  const claims = await resolveBuilderMcpClaims(request, env);

  if (!claims) {
    return null;
  }

  const studioUrl = resolveStudioServerFetchBase(claims.studio_url, env);

  if (!studioUrl) {
    return null;
  }

  const cookies = parseCookies(request.headers.get('Cookie'));
  const mcpToken = await resolveValidBuilderMcpToken(
    [readBearerToken(request), cookies[BUILDER_MCP_COOKIE]],
    env,
  );

  if (!mcpToken) {
    return null;
  }

  const response = await fetchStudioPromptQuota({
    studioUrl,
    projectRef: claims.project_ref,
    mcpToken,
    method: 'GET',
  });

  if (!response.ok) {
    return null;
  }

  return (await response.json()) as BuilderPromptQuotaState;
}

export async function consumeBuilderPromptFromStudio(
  request: Request,
  env?: ServerEnv,
): Promise<
  | { ok: true; quota: BuilderPromptQuotaState }
  | { ok: false; quota: BuilderPromptQuotaState; upgradeUrl: string }
  | { ok: false; unauthorized: true }
> {
  const claims = await resolveBuilderMcpClaims(request, env);

  if (!claims) {
    return { ok: false, unauthorized: true };
  }

  const studioUrl = resolveStudioServerFetchBase(claims.studio_url, env);

  if (!studioUrl) {
    return { ok: false, unauthorized: true };
  }

  const cookies = parseCookies(request.headers.get('Cookie'));
  const mcpToken = await resolveValidBuilderMcpToken(
    [readBearerToken(request), cookies[BUILDER_MCP_COOKIE]],
    env,
  );

  if (!mcpToken) {
    return { ok: false, unauthorized: true };
  }

  const response = await fetchStudioPromptQuota({
    studioUrl,
    projectRef: claims.project_ref,
    mcpToken,
    method: 'POST',
  });

  const payload = (await response.json().catch(() => ({}))) as BuilderPromptQuotaState & {
    message?: string;
    upgradeUrl?: string;
  };

  if (response.status === 402) {
    return {
      ok: false,
      quota: payload,
      upgradeUrl: payload.upgradeUrl || `/org/${claims.organization_slug}/billing?panel=subscriptionPlan`,
    };
  }

  if (!response.ok) {
    if (response.status >= 500) {
      console.warn('[builder-prompt-quota] Studio quota API unavailable, allowing request', response.status);
      return {
        ok: true,
        quota: {
          plan: 'free',
          used: 0,
          limit: null,
          remaining: null,
          isFree: false,
          upgradeUrl: `/org/${claims.organization_slug}/billing?panel=subscriptionPlan`,
        },
      };
    }

    throw json(
      {
        error: true,
        message: payload.message || 'Failed to verify Builder prompt quota',
        statusCode: response.status,
      },
      { status: response.status },
    );
  }

  return { ok: true, quota: payload };
}

export function buildStudioBillingUrl(studioUrl: string, upgradePath: string): string {
  if (upgradePath.startsWith('http://') || upgradePath.startsWith('https://')) {
    return upgradePath;
  }

  return new URL(upgradePath, `${studioUrl.replace(/\/+$/, '')}/`).toString();
}
