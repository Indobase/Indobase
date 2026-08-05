import { json, type LoaderFunctionArgs } from '@remix-run/cloudflare';

import {
  probeWebContainerHeadless,
  resolveBuilderPublicOrigin,
} from '~/lib/webcontainer/headless-probe.server';
import { isProductionEnv, resolveBuilderHandoffSecretForStartup } from '~/lib/production.server';

export const loader = async ({ request, context }: LoaderFunctionArgs) => {
  const env = (context as { cloudflare?: { env?: Record<string, string | undefined> } })?.cloudflare?.env;
  const checks: Record<string, { status: 'ok' | 'error'; message?: string }> = {};

  const handoffSecret =
    env?.BUILDER_HANDOFF_SECRET?.trim() ||
    process.env.BUILDER_HANDOFF_SECRET?.trim() ||
    resolveBuilderHandoffSecretForStartup(env);

  checks.handoffSecret = handoffSecret.length >= 32
    ? { status: 'ok' }
    : { status: 'error', message: 'BUILDER_HANDOFF_SECRET is missing or too short' };

  if (isProductionEnv(env)) {
    if (env?.BUILDER_ALLOW_UNAUTHENTICATED === 'true' || process.env.BUILDER_ALLOW_UNAUTHENTICATED === 'true') {
      checks.authBypass = { status: 'error', message: 'BUILDER_ALLOW_UNAUTHENTICATED is enabled' };
    } else {
      checks.authBypass = { status: 'ok' };
    }
  }

  const hasLlmKey = Boolean(
    process.env.OPEN_ROUTER_API_KEY?.trim() ||
      process.env.OPENROUTER_API_KEY?.trim() ||
      process.env.OPENAI_API_KEY?.trim() ||
      process.env.ANTHROPIC_API_KEY?.trim() ||
      env?.OPEN_ROUTER_API_KEY?.trim() ||
      env?.OPENROUTER_API_KEY?.trim() ||
      env?.OPENAI_API_KEY?.trim() ||
      env?.ANTHROPIC_API_KEY?.trim(),
  );

  checks.llmProvider = hasLlmKey
    ? { status: 'ok' }
    : { status: 'error', message: 'No server LLM API key configured' };

  if (isProductionEnv(env)) {
    const hasWebcontainerKey = Boolean(
      process.env.WEBCONTAINER_API_KEY?.trim() ||
        process.env.VITE_WEBCONTAINER_API_KEY?.trim() ||
        env?.WEBCONTAINER_API_KEY?.trim() ||
        env?.VITE_WEBCONTAINER_API_KEY?.trim(),
    );

    // Degraded (not ready=false) so deploy health gates still pass while preview is fixed.
    checks.webcontainerApiKey = hasWebcontainerKey
      ? { status: 'ok' }
      : {
          status: 'error',
          message:
            'WEBCONTAINER_API_KEY missing — production preview requires a StackBlitz WebContainer API key with builder.indobase.in allowlisted',
        };

    if (hasWebcontainerKey) {
      const key =
        process.env.WEBCONTAINER_API_KEY?.trim() ||
        process.env.VITE_WEBCONTAINER_API_KEY?.trim() ||
        env?.WEBCONTAINER_API_KEY?.trim() ||
        env?.VITE_WEBCONTAINER_API_KEY?.trim() ||
        '';
      const origin = resolveBuilderPublicOrigin(request.url, env);
      const allowlisted = await probeWebContainerHeadless(key, origin);

      checks.webcontainerAllowlist = allowlisted
        ? { status: 'ok' }
        : {
            status: 'error',
            message: `StackBlitz /headless rejected ${origin || 'this Builder host'} (404). Allowlist builder.indobase.in and builder.indobase.fun in the StackBlitz API Console for this key. Server draft preview remains available.`,
          };
    }
  }

  const blockingChecks = Object.entries(checks).filter(
    ([name]) => name !== 'webcontainerApiKey' && name !== 'webcontainerAllowlist',
  );
  const ready = blockingChecks.every(([, check]) => check.status === 'ok');

  return json(
    {
      checks,
      ready,
      service: 'indobase-builder',
      status: ready ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
    },
    { status: ready ? 200 : 503 },
  );
};
