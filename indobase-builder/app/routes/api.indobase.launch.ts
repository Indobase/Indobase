import { json, type ActionFunctionArgs } from '@remix-run/node';

import { completeBuilderHandoff } from '~/lib/indobase/launch-handoff.server';
import { isProductionEnv } from '~/lib/production.server';

type LaunchBody = {
  handoffToken?: string;
  next?: string;
};

export const action = async ({ request, context }: ActionFunctionArgs) => {
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, { status: 405 });
  }

  let body: LaunchBody;

  try {
    body = (await request.json()) as LaunchBody;
  } catch {
    return json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const handoffToken = body.handoffToken?.trim();

  if (!handoffToken) {
    return json({ error: 'handoffToken is required' }, { status: 400 });
  }

  const env = (context as { cloudflare?: { env?: Record<string, string | undefined> } })?.cloudflare?.env;

  try {
    const { handoff, mcpToken, cookieHeader } = await completeBuilderHandoff(handoffToken, env);

    return json(
      {
        success: true,
        handoff,
        mcpToken,
        next: body.next,
      },
      {
        headers: {
          'Set-Cookie': cookieHeader,
        },
      },
    );
  } catch (error) {
    const message = isProductionEnv(env)
      ? 'Invalid or expired Builder launch link. Reconnect from Studio.'
      : error instanceof Error
        ? error.message
        : 'Invalid Builder launch token';

    return json({ error: message }, { status: 400 });
  }
};
