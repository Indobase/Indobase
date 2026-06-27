import type { SupabaseConnectionState } from '~/lib/stores/supabase';
import { updateSupabaseConnection } from '~/lib/stores/supabase';
import { isIndobaseStudioManagedConnection } from './connection';

const DEFAULT_STUDIO_URL = 'https://studio.indobase.in';

export function getStoredSupabaseConnection(): SupabaseConnectionState | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const raw = window.localStorage.getItem('supabase_connection');

  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as SupabaseConnectionState;
  } catch {
    return null;
  }
}

export function getStoredBuilderMcpToken(): string | null {
  const connection = getStoredSupabaseConnection();

  if (!isIndobaseStudioManagedConnection(connection)) {
    return null;
  }

  return connection.indobase.mcpToken?.trim() || null;
}

export function getBuilderAuthHeaders(): Record<string, string> {
  const token = getStoredBuilderMcpToken();

  if (!token) {
    return {};
  }

  return {
    Authorization: `Bearer ${token}`,
  };
}

export function getBuilderRequestInit(init: RequestInit = {}): RequestInit {
  const headers = new Headers(init.headers);

  for (const [key, value] of Object.entries(getBuilderAuthHeaders())) {
    headers.set(key, value);
  }

  return {
    ...init,
    credentials: 'include',
    headers,
  };
}

export async function builderFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  return fetch(input, getBuilderRequestInit(init));
}

export function getStudioOrigin(connection?: SupabaseConnectionState | null): string {
  return connection?.indobase?.studioUrl?.replace(/\/+$/, '') || DEFAULT_STUDIO_URL;
}

export function getStudioBuilderConnectUrl(options?: {
  connection?: SupabaseConnectionState | null;
  projectRef?: string;
  returnTo?: string;
}): string {
  const connection = options?.connection ?? getStoredSupabaseConnection();
  const studioUrl = getStudioOrigin(connection);
  const projectRef =
    options?.projectRef ||
    connection?.indobase?.projectRef ||
    connection?.selectedProjectId ||
    '';

  if (!projectRef) {
    const returnTo = options?.returnTo || (typeof window !== 'undefined' ? window.location.pathname : '/');
    return `${studioUrl}/sign-in?returnTo=${encodeURIComponent(returnTo)}`;
  }

  const params = new URLSearchParams();

  if (options?.returnTo) {
    params.set('return_to', options.returnTo);
  }

  const suffix = params.toString() ? `?${params.toString()}` : '';

  return `${studioUrl}/project/${encodeURIComponent(projectRef)}/builder/connect${suffix}`;
}

export function clearStaleBuilderSession() {
  const connection = getStoredSupabaseConnection();

  if (!connection?.indobase) {
    return;
  }

  updateSupabaseConnection({
    isConnected: false,
    connectionSource: undefined,
    indobase: {
      ...connection.indobase,
      mcpToken: undefined,
    },
  });
}

export async function ensureBuilderSession(): Promise<boolean> {
  try {
    const cookieResponse = await fetch('/api/indobase/session', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });

    if (cookieResponse.ok) {
      return true;
    }

    const token = getStoredBuilderMcpToken();

    if (!token) {
      if (cookieResponse.status === 401) {
        clearStaleBuilderSession();
      }

      return false;
    }

    const response = await fetch('/api/indobase/session', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ mcpToken: token }),
    });

    if (response.ok) {
      return true;
    }

    if (response.status === 401) {
      clearStaleBuilderSession();
    }

    return false;
  } catch {
    return false;
  }
}

export function redirectToStudioBuilderConnect(returnTo?: string) {
  if (typeof window === 'undefined') {
    return;
  }

  const target = getStudioBuilderConnectUrl({
    returnTo: returnTo || `${window.location.pathname}${window.location.search}`,
  });

  window.location.href = target;
}
