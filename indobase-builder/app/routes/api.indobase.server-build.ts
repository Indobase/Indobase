import { json, type ActionFunctionArgs } from '@remix-run/node';

import type { FileMap } from '~/lib/stores/files';
import { getDeployEnvironmentVariables } from '~/lib/indobase/deployEnv';
import { verifyIndobaseProxyRequest } from '~/lib/indobase/indobase-proxy.server';
import { buildProjectArtifactsOnServer } from '~/lib/indobase/serverProjectBuild.server';
import { withSecurity } from '~/lib/security';
import { WORK_DIR } from '~/utils/constants';

type ServerBuildBody = {
  credentials?: {
    anonKey?: string;
    apiUrl?: string;
  };
  files?: FileMap;
  mcpToken?: string;
  projectRef?: string;
  studioUrl?: string;
};

function fileMapToProjectFiles(files: FileMap): Record<string, string> {
  const projectFiles: Record<string, string> = {};

  for (const [filePath, entry] of Object.entries(files)) {
    if (!entry || entry.type !== 'file' || entry.isBinary) {
      continue;
    }

    let relative = filePath;

    if (relative.startsWith(WORK_DIR)) {
      relative = relative.slice(WORK_DIR.length);
    }

    relative = relative.replace(/^\/+/, '');

    if (!relative || relative.includes('..')) {
      continue;
    }

    projectFiles[relative] = entry.content;
  }

  return projectFiles;
}

async function serverBuildAction({ request, context }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, { status: 405 });
  }

  let body: ServerBuildBody;

  try {
    body = (await request.json()) as ServerBuildBody;
  } catch {
    return json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const env = (context as { cloudflare?: { env?: Record<string, string | undefined> } })?.cloudflare?.env;
  const proxy = await verifyIndobaseProxyRequest(request, body, env);

  if (!body.files || Object.keys(body.files).length === 0) {
    return json({ success: false, error: 'No project files provided' }, { status: 400 });
  }

  const projectFiles = fileMapToProjectFiles(body.files);
  const buildEnv = getDeployEnvironmentVariables({
    credentials: body.credentials,
    indobase: {
      projectRef: proxy.projectRef,
      studioUrl: proxy.studioUrl,
    },
  });

  const result = await buildProjectArtifactsOnServer(projectFiles, buildEnv);

  return json(result, { status: result.success ? 200 : 500 });
}

export const action = withSecurity(serverBuildAction, { requireAuth: true });
