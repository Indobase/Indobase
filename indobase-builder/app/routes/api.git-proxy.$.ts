import { json } from '@remix-run/cloudflare';
import type { ActionFunctionArgs, LoaderFunctionArgs } from '@remix-run/cloudflare';

import { withSecurity } from '~/lib/security';

const ALLOWED_GIT_PROXY_HOSTS = new Set([
  'github.com',
  'www.github.com',
  'gitlab.com',
  'www.gitlab.com',
  'bitbucket.org',
  'www.bitbucket.org',
  'codeberg.org',
  'www.codeberg.org',
]);

const ALLOW_HEADERS = [
  'accept-encoding',
  'accept-language',
  'accept',
  'cache-control',
  'connection',
  'content-length',
  'content-type',
  'dnt',
  'pragma',
  'range',
  'referer',
  'user-agent',
  'x-http-method-override',
  'x-requested-with',
];

const EXPOSE_HEADERS = [
  'accept-ranges',
  'age',
  'cache-control',
  'content-length',
  'content-language',
  'content-type',
  'date',
  'etag',
  'expires',
  'last-modified',
  'pragma',
  'server',
  'transfer-encoding',
  'vary',
  'x-github-request-id',
  'x-redirected-url',
];

function normalizeProxyHost(domain: string): string | null {
  const trimmed = domain.trim().toLowerCase();
  if (!trimmed || trimmed.includes('/') || trimmed.includes(':')) {
    return null;
  }
  return ALLOWED_GIT_PROXY_HOSTS.has(trimmed) ? trimmed : null;
}

async function handleProxyRequest(request: Request, path: string | undefined) {
  try {
    if (!path) {
      return json({ error: 'Invalid proxy URL format' }, { status: 400 });
    }

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 200,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
          'Access-Control-Allow-Headers': ALLOW_HEADERS.join(', '),
          'Access-Control-Expose-Headers': EXPOSE_HEADERS.join(', '),
          'Access-Control-Max-Age': '86400',
        },
      });
    }

    const parts = path.match(/([^\/]+)\/?(.*)/);
    if (!parts) {
      return json({ error: 'Invalid path format' }, { status: 400 });
    }

    const domain = normalizeProxyHost(parts[1]);
    if (!domain) {
      return json({ error: 'Git host is not allowed' }, { status: 403 });
    }

    const remainingPath = parts[2] || '';
    const url = new URL(request.url);
    const targetURL = `https://${domain}/${remainingPath}${url.search}`;

    const headers = new Headers();
    for (const header of ALLOW_HEADERS) {
      if (request.headers.has(header)) {
        headers.set(header, request.headers.get(header)!);
      }
    }

    const authorization = request.headers.get('authorization') ?? request.headers.get('x-authorization');
    if (authorization) {
      headers.set('Authorization', authorization);
    }

    headers.set('Host', domain);

    if (!headers.has('user-agent') || !headers.get('user-agent')?.startsWith('git/')) {
      headers.set('User-Agent', 'git/@isomorphic-git/cors-proxy');
    }

    const fetchOptions: RequestInit = {
      method: request.method,
      headers,
      redirect: 'manual',
    };

    if (!['GET', 'HEAD'].includes(request.method)) {
      fetchOptions.body = request.body;
      fetchOptions.duplex = 'half';
    }

    const response = await fetch(targetURL, fetchOptions);

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (location) {
        try {
          const redirectHost = new URL(location, targetURL).hostname.toLowerCase();
          if (!ALLOWED_GIT_PROXY_HOSTS.has(redirectHost)) {
            return json({ error: 'Redirect target is not allowed' }, { status: 403 });
          }
        } catch {
          return json({ error: 'Invalid redirect target' }, { status: 403 });
        }
      }
    }

    const responseHeaders = new Headers();
    responseHeaders.set('Access-Control-Allow-Origin', '*');
    responseHeaders.set('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
    responseHeaders.set('Access-Control-Allow-Headers', ALLOW_HEADERS.join(', '));
    responseHeaders.set('Access-Control-Expose-Headers', EXPOSE_HEADERS.join(', '));

    for (const header of EXPOSE_HEADERS) {
      if (header === 'content-length') continue;
      if (response.headers.has(header)) {
        responseHeaders.set(header, response.headers.get(header)!);
      }
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (location) {
        responseHeaders.set('x-redirected-url', location);
      }
    }

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    });
  } catch (error) {
    console.error('Proxy error:', error);
    return json(
      {
        error: 'Proxy error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    );
  }
}

async function gitProxyHandler({ request, params }: ActionFunctionArgs | LoaderFunctionArgs) {
  return handleProxyRequest(request, params['*']);
}

export const action = withSecurity(gitProxyHandler, { requireAuth: false, rateLimit: true });
export const loader = withSecurity(gitProxyHandler, { requireAuth: false, rateLimit: true });
