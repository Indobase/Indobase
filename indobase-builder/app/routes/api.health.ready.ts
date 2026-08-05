import { json, type LoaderFunctionArgs } from '@remix-run/cloudflare';

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
    // Product preview is self-hosted sandbox (+ draft fallback). StackBlitz is not required.
    checks.previewSandbox = { status: 'ok', message: 'host sandbox + draft fallback (no WebContainer)' };
    checks.webcontainerApiKey = {
      status: 'ok',
      message: 'skipped — Builder uses self-hosted sandbox preview (no StackBlitz)',
    };
    checks.webcontainerAllowlist = {
      status: 'ok',
      message: 'skipped — sandbox preview mode',
    };
  }

  const blockingChecks = Object.entries(checks).filter(
    ([name]) =>
      name !== 'webcontainerApiKey' && name !== 'webcontainerAllowlist' && name !== 'previewSandbox',
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
