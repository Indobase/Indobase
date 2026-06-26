import { getBuilderRequestInit } from '~/lib/indobase/builder-auth.client';
import type { SupabaseConnectionState } from '~/lib/stores/supabase';

export type IndobaseDeploymentStatus = 'requested' | 'building' | 'ready' | 'failed' | 'archived';

export type IndobaseDeployment = {
  completed_at: string | null;
  custom_domain_hostname: string | null;
  id: string;
  inserted_at: string;
  last_error: string | null;
  metadata: Record<string, unknown>;
  project_ref: string;
  requested_via: string;
  status: IndobaseDeploymentStatus;
  target_url: string;
  updated_at: string;
};

export type QueueDeploymentParams = {
  artifacts?: Record<string, string>;
  metadata?: Record<string, unknown>;
};

export type QueueDeploymentResult = {
  deployment?: IndobaseDeployment;
  error?: string;
  status?: number;
  success: boolean;
};

export type GetDeploymentResult = {
  deployment?: IndobaseDeployment;
  error?: string;
  status?: number;
  success: boolean;
};

type IndobaseStudioRequest = {
  mcpToken: string;
  projectRef: string;
  studioUrl: string;
};

export type QueueMobileBuildParams = {
  framework?: 'expo' | 'react_native' | 'flutter' | 'other';
  metadata?: Record<string, unknown>;
  profile?: 'production' | 'preview';
  sourceFiles?: Record<string, string>;
  target?: 'android_aab';
};

export type QueueMobileBuildResult = {
  build?: unknown;
  error?: string;
  status?: number;
  success: boolean;
};

type QueueMobileBuildRequest = QueueMobileBuildParams & {
  mcpToken: string;
  projectRef: string;
  studioUrl: string;
};

function hasIndobaseStudioHandoff(connection?: SupabaseConnectionState | null): connection is SupabaseConnectionState {
  return Boolean(
    connection?.connectionSource === 'studio_handoff' &&
      connection.indobase?.mcpToken &&
      connection.indobase?.studioUrl &&
      (connection.indobase?.projectRef || connection.selectedProjectId),
  );
}

export function canQueueIndobaseMobileBuild(connection?: SupabaseConnectionState | null): boolean {
  return hasIndobaseStudioHandoff(connection);
}

export function canQueueIndobaseDeployment(connection?: SupabaseConnectionState | null): boolean {
  return hasIndobaseStudioHandoff(connection);
}

function resolveIndobaseStudioRequest(connection: SupabaseConnectionState): IndobaseStudioRequest | null {
  const projectRef = connection.indobase?.projectRef || connection.selectedProjectId;
  const studioUrl = connection.indobase?.studioUrl;
  const mcpToken = connection.indobase?.mcpToken;

  if (!projectRef || !studioUrl || !mcpToken) {
    return null;
  }

  return {
    mcpToken,
    projectRef,
    studioUrl,
  };
}

const TERMINAL_DEPLOYMENT_STATUSES: IndobaseDeploymentStatus[] = ['ready', 'failed', 'archived'];

function isTerminalDeploymentStatus(status: IndobaseDeploymentStatus) {
  return TERMINAL_DEPLOYMENT_STATUSES.includes(status);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function queueIndobaseMobileBuild(
  connection: SupabaseConnectionState,
  params: QueueMobileBuildParams = {},
): Promise<QueueMobileBuildResult> {
  const projectRef = connection.indobase?.projectRef || connection.selectedProjectId;
  const studioUrl = connection.indobase?.studioUrl;
  const mcpToken = connection.indobase?.mcpToken;

  if (!projectRef || !studioUrl || !mcpToken) {
    return {
      success: false,
      error: 'Connect from Indobase Studio to queue Android builds from Builder.',
    };
  }

  const payload: QueueMobileBuildRequest = {
    mcpToken,
    projectRef,
    studioUrl,
    ...params,
  };

  const response = await fetch(
    '/api/indobase/mobile-build',
    getBuilderRequestInit({
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    }),
  );

  const data = (await response.json().catch(() => ({}))) as { error?: string; message?: string };

  if (!response.ok) {
    return {
      success: false,
      error: data.error || data.message || 'Failed to queue Android bundle build',
      status: response.status,
    };
  }

  return {
    success: true,
    build: data,
    status: response.status,
  };
}

export async function queueIndobaseDeployment(
  connection: SupabaseConnectionState,
  params: QueueDeploymentParams = {},
): Promise<QueueDeploymentResult> {
  const studioRequest = resolveIndobaseStudioRequest(connection);

  if (!studioRequest) {
    return {
      success: false,
      error: 'Connect from Indobase Studio to publish from Builder.',
    };
  }

  const response = await fetch(
    '/api/indobase/deploy',
    getBuilderRequestInit({
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ...studioRequest,
        ...params,
      }),
    }),
  );

  const data = (await response.json().catch(() => ({}))) as IndobaseDeployment & {
    error?: string;
    message?: string;
  };

  if (!response.ok) {
    return {
      success: false,
      error: data.error || data.message || 'Failed to queue deployment',
      status: response.status,
    };
  }

  return {
    success: true,
    deployment: data,
    status: response.status,
  };
}

export async function getIndobaseDeployment(
  connection: SupabaseConnectionState,
  deploymentId: string,
): Promise<GetDeploymentResult> {
  const studioRequest = resolveIndobaseStudioRequest(connection);

  if (!studioRequest) {
    return {
      success: false,
      error: 'Connect from Indobase Studio to check deployment status.',
    };
  }

  const response = await fetch(
    '/api/indobase/deploy',
    getBuilderRequestInit({
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ...studioRequest,
        deploymentId,
      }),
    }),
  );

  const data = (await response.json().catch(() => ({}))) as IndobaseDeployment & {
    error?: string;
    message?: string;
  };

  if (!response.ok) {
    return {
      success: false,
      error: data.error || data.message || 'Failed to load deployment status',
      status: response.status,
    };
  }

  return {
    success: true,
    deployment: data,
    status: response.status,
  };
}

export async function publishIndobaseDeployment(
  connection: SupabaseConnectionState,
  params: QueueDeploymentParams = {},
  options?: {
    onStatus?: (deployment: IndobaseDeployment) => void;
    pollIntervalMs?: number;
    timeoutMs?: number;
  },
): Promise<QueueDeploymentResult & { deployment?: IndobaseDeployment }> {
  const queued = await queueIndobaseDeployment(connection, params);

  if (!queued.success || !queued.deployment?.id) {
    return queued;
  }

  const pollIntervalMs = options?.pollIntervalMs ?? 3000;
  const timeoutMs = options?.timeoutMs ?? 120000;
  const startedAt = Date.now();
  let latest = queued.deployment;

  options?.onStatus?.(latest);

  while (!isTerminalDeploymentStatus(latest.status)) {
    if (Date.now() - startedAt > timeoutMs) {
      return {
        success: false,
        deployment: latest,
        error: 'Deployment is still in progress. Check status in Studio.',
        status: 408,
      };
    }

    await sleep(pollIntervalMs);

    const statusResult = await getIndobaseDeployment(connection, latest.id);

    if (!statusResult.success || !statusResult.deployment) {
      return {
        success: false,
        deployment: latest,
        error: statusResult.error || 'Failed to refresh deployment status',
        status: statusResult.status,
      };
    }

    latest = statusResult.deployment;
    options?.onStatus?.(latest);
  }

  if (latest.status === 'ready') {
    return {
      success: true,
      deployment: latest,
      status: 200,
    };
  }

  return {
    success: false,
    deployment: latest,
    error: latest.last_error || 'Deployment failed',
    status: 400,
  };
}
