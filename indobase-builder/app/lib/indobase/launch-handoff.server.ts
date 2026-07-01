import { BUILDER_MCP_COOKIE, BUILDER_MCP_TOKEN_TTL_SECONDS } from '~/lib/indobase/builder-session.constants';
import { signIndobaseBuilderMcpToken, verifyIndobaseStudioHandoff } from '~/lib/indobase/handoff.server';
import type { IndobaseBuilderHandoffPayload } from '~/types/indobase';

type ServerEnv = Record<string, string | undefined>;

export type CompletedBuilderHandoff = {
  cookieHeader: string;
  handoff: IndobaseBuilderHandoffPayload;
  mcpToken: string;
};

export async function completeBuilderHandoff(
  handoffToken: string,
  env?: ServerEnv,
): Promise<CompletedBuilderHandoff> {
  const handoff = await verifyIndobaseStudioHandoff(handoffToken, env);
  const mcpToken = signIndobaseBuilderMcpToken(handoff, BUILDER_MCP_TOKEN_TTL_SECONDS, env);
  const maxAge = BUILDER_MCP_TOKEN_TTL_SECONDS;
  const nodeEnv = env?.NODE_ENV ?? process.env.NODE_ENV;
  const secure = nodeEnv === 'production' ? '; Secure' : '';
  const cookieHeader = `${BUILDER_MCP_COOKIE}=${mcpToken}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;

  return { handoff, mcpToken, cookieHeader };
}
