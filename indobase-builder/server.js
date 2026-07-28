import { createRequestHandler } from '@remix-run/node';
import { Buffer } from 'node:buffer';
import process from 'node:process';
import mime from 'mime';
import { createReadStream, promises as fs } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pathToFileURL } from 'node:url';

// Vite SSR bundles can ship stream polyfills without Node's Buffer global.
globalThis.Buffer = Buffer;
globalThis.process = process;

function validateProductionEnv() {
  if (process.env.NODE_ENV !== 'production') {
    return;
  }

  if (process.env.BUILDER_ALLOW_UNAUTHENTICATED === 'true') {
    throw new Error('BUILDER_ALLOW_UNAUTHENTICATED must not be enabled in production');
  }

  const secret = process.env.BUILDER_HANDOFF_SECRET?.trim() || '';

  if (secret.length < 32) {
    throw new Error('BUILDER_HANDOFF_SECRET must be set to at least 32 characters in production');
  }
}

validateProductionEnv();

const mode = process.env.NODE_ENV === 'production' ? 'production' : 'development';
const host = process.env.HOST || '0.0.0.0';
const port = Number(process.env.PORT || 5173);
const rootDir = process.cwd();
const clientAssetsDir = path.join(rootDir, 'build', 'client');
const publicAssetsDir = path.join(rootDir, 'public');

async function loadServerBuild() {
  const serverBuildPath = path.join(rootDir, 'build', 'server', 'index.js');
  return import(pathToFileURL(serverBuildPath).href);
}

function getRequestOrigin(req) {
  const forwardedProto = req.headers['x-forwarded-proto'];
  const forwardedHost = req.headers['x-forwarded-host'];
  const proto = Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto || 'http';
  const hostHeader = Array.isArray(forwardedHost)
    ? forwardedHost[0]
    : forwardedHost || req.headers.host || `localhost:${port}`;

  return `${proto}://${hostHeader}`;
}

function createWebRequest(req) {
  const url = new URL(req.url || '/', getRequestOrigin(req));
  const headers = new Headers();

  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined) {
      continue;
    }

    if (Array.isArray(value)) {
      for (const entry of value) {
        headers.append(key, entry);
      }
    } else {
      headers.set(key, value);
    }
  }

  const init = {
    method: req.method,
    headers,
    body: req.method && ['GET', 'HEAD'].includes(req.method) ? undefined : Readable.toWeb(req),
    duplex: 'half',
  };

  return new Request(url, init);
}

async function serveAsset(urlPath, assetsRoot) {
  const assetPath = path.join(assetsRoot, urlPath.replace(/^\/+/, ''));
  const normalizedAssetPath = path.normalize(assetPath);

  if (!normalizedAssetPath.startsWith(assetsRoot)) {
    return undefined;
  }

  const stat = await fs.stat(normalizedAssetPath).catch(() => undefined);

  if (!stat?.isFile()) {
    return undefined;
  }

  const headers = new Headers();
  const mimeType = mime.getType(normalizedAssetPath);

  if (mimeType) {
    headers.set('Content-Type', mimeType);
  }

  headers.set('Content-Length', String(stat.size));
  // Match HTML document isolation so credentialless COEP stays consistent for subresources.
  headers.set('Cross-Origin-Embedder-Policy', 'credentialless');
  headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  headers.set('Cross-Origin-Resource-Policy', 'same-origin');
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

  return new Response(Readable.toWeb(createReadStream(normalizedAssetPath)), { headers });
}

async function sendWebResponse(res, response) {
  res.statusCode = response.status;

  response.headers.forEach((value, key) => {
    res.setHeader(key, value);
  });

  if (!response.body) {
    res.end();
    return;
  }

  const body = Readable.fromWeb(response.body);

  await new Promise((resolve, reject) => {
    body.on('error', reject);
    res.on('error', reject);
    res.on('finish', resolve);
    body.pipe(res);
  });
}

// Remix Cloudflare builds polyfill `process.env` as an empty object in SSR bundles.
// Merge the real Node env before each request so server loaders can read secrets.
function mergeNodeProcessEnv() {
  globalThis.process = process;
  if (globalThis.process?.env) {
    Object.assign(globalThis.process.env, process.env);
  }
}

const serverBuild = await loadServerBuild();
const requestHandler = createRequestHandler(serverBuild, mode);

const server = http.createServer(async (req, res) => {
  try {
    const requestUrl = new URL(req.url || '/', getRequestOrigin(req));
    const assetResponse =
      (await serveAsset(requestUrl.pathname, clientAssetsDir)) ||
      (await serveAsset(requestUrl.pathname, publicAssetsDir));

    if (assetResponse) {
      await sendWebResponse(res, assetResponse);
      return;
    }

    const request = createWebRequest(req);
    mergeNodeProcessEnv();
    const response = await requestHandler(request, {
      cloudflare: {
        env: process.env,
      },
    });

    await sendWebResponse(res, response);
  } catch (error) {
    const message =
      mode === 'development'
        ? error instanceof Error
          ? error.stack || error.message
          : 'Unknown server error'
        : 'Internal server error';
    res.statusCode = 500;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.end(message);
  }
});

server.listen(port, host, () => {
  console.log(`Indobase Builder server listening on http://${host}:${port}`);
});
