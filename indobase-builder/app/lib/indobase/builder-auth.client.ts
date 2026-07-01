import type { SupabaseConnectionState } from '~/lib/stores/supabase';
import { updateSupabaseConnection } from '~/lib/stores/supabase';
import { isIndobaseStudioManagedConnection } from './connection';
import {
  BUILDER_LAST_PROJECT_REF_KEY,
  BUILDER_MCP_TOKEN_TTL_SECONDS,
  BUILDER_SESSION_KEEPALIVE_MS,
  BUILDER_SESSION_REFRESH_LEAD_MS,
} from './builder-session.constants';

const DEFAULT_STUDIO_URL = 'https://studio.indobase.in';

type SessionResponse = {
  error?: string;
  expiresAt?: number;
  mcpToken?: string;
  organizationSlug?: string;
  projectRef?: string;
  statusCode?: number;
  studioUrl?: string;
  success?: boolean;
};

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

export function getLastProjectRef(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const stored = window.localStorage.getItem(BUILDER_LAST_PROJECT_REF_KEY)?.trim();
  if (stored) {
    return stored;
  }

  const connection = getStoredSupabaseConnection();
  return connection?.indobase?.projectRef || connection?.selectedProjectId || null;
}

export function persistLastProjectRef(projectRef: string) {
  if (typeof window === 'undefined' || !projectRef.trim()) {
    return;
  }

  window.localStorage.setItem(BUILDER_LAST_PROJECT_REF_KEY, projectRef.trim());
}

export function getStoredBuilderMcpToken(): string | null {
  const connection = getStoredSupabaseConnection();

  if (!isIndobaseStudioManagedConnection(connection)) {
    return null;
  }

  return connection.indobase.mcpToken?.trim() || null;
}

function decodeJwtExp(token: string): number | null {
  const parts = token.split('.');

  if (parts.length < 2) {
    return null;
  }

  try {
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'))) as { exp?: number };
    return typeof payload.exp === 'number' ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
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
  popup?: boolean;
}): string {
  const connection = options?.connection ?? getStoredSupabaseConnection();
  const studioUrl = getStudioOrigin(connection);
  const projectRef =
    options?.projectRef ||
    connection?.indobase?.projectRef ||
    connection?.selectedProjectId ||
    getLastProjectRef() ||
    '';

  const returnTo = options?.returnTo || (typeof window !== 'undefined' ? window.location.pathname : '/');

  if (!projectRef) {
    return `${studioUrl}/sign-in?returnTo=${encodeURIComponent(returnTo)}`;
  }

  const params = new URLSearchParams();

  if (options?.returnTo) {
    params.set('return_to', options.returnTo);
  }

  if (options?.popup) {
    params.set('popup', '1');
  }

  const suffix = params.toString() ? `?${params.toString()}` : '';

  return `${studioUrl}/project/${encodeURIComponent(projectRef)}/builder/connect${suffix}`;
}

function applySessionToStoredConnection(session: SessionResponse) {
  if (!session.mcpToken) {
    return;
  }

  const connection = getStoredSupabaseConnection();

  if (!connection || connection.connectionSource !== 'studio_handoff') {
    return;
  }

  const projectRef = session.projectRef || connection.indobase?.projectRef || connection.selectedProjectId || '';
  persistLastProjectRef(projectRef);

  updateSupabaseConnection({
    isConnected: true,
    connectionSource: 'studio_handoff',
    selectedProjectId: projectRef || connection.selectedProjectId,
    indobase: {
      apiUrl: connection.indobase?.apiUrl || connection.credentials?.supabaseUrl || '',
      authUrl: connection.indobase?.authUrl || `${connection.credentials?.supabaseUrl || ''}/auth/v1`,
      organizationSlug: session.organizationSlug || connection.indobase?.organizationSlug || '',
      projectRef,
      projectUrl: connection.indobase?.projectUrl || '',
      restUrl: connection.indobase?.restUrl || `${connection.credentials?.supabaseUrl || ''}/rest/v1/`,
      storageUrl: connection.indobase?.storageUrl || `${connection.credentials?.supabaseUrl || ''}/storage/v1`,
      studioUrl: session.studioUrl || connection.indobase?.studioUrl || DEFAULT_STUDIO_URL,
      mcpToken: session.mcpToken,
    },
  });
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
    const storedToken = getStoredBuilderMcpToken();
    const response = await fetch(
      '/api/indobase/session',
      getBuilderRequestInit({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(storedToken ? { mcpToken: storedToken } : {}),
      }),
    );

    const data = (await response.json().catch(() => ({}))) as SessionResponse;

    if (response.ok && data.success) {
      applySessionToStoredConnection(data);
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

export async function restoreBuilderSessionOnLoad(): Promise<boolean> {
  return ensureBuilderSession();
}

let refreshPopup: Window | null = null;

export function refreshBuilderSessionViaStudioPopup(returnTo?: string): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  if (refreshPopup && !refreshPopup.closed) {
    refreshPopup.focus();
    return true;
  }

  const url = getStudioBuilderConnectUrl({
    returnTo: returnTo || `${window.location.pathname}${window.location.search}`,
    popup: true,
  });

  refreshPopup = window.open(url, 'indobase-builder-connect', 'width=520,height=720');

  return Boolean(refreshPopup);
}

function shouldRefreshSessionSoon(): boolean {
  const token = getStoredBuilderMcpToken();

  if (!token) {
    return true;
  }

  const expiresAt = decodeJwtExp(token);

  if (!expiresAt) {
    return false;
  }

  return expiresAt - Date.now() < BUILDER_SESSION_REFRESH_LEAD_MS;
}

export function startBuilderSessionKeeper(): () => void {
  if (typeof window === 'undefined') {
    return () => undefined;
  }

  const onMessage = (event: MessageEvent) => {
    const studioUrl = getStudioOrigin();

    if (event.origin !== studioUrl) {
      return;
    }

    if (event.data?.type === 'indobase-builder-session' && event.data?.success) {
      void ensureBuilderSession().then((restored) => {
        if (restored) {
          void import('~/lib/stores/mcp').then(({ useMCPStore }) => {
            void useMCPStore.getState().syncWithIndobaseConnection();
          });
        }
      });
    }
  };

  window.addEventListener('message', onMessage);

  const intervalId = window.setInterval(() => {
    void (async () => {
      const restored = await ensureBuilderSession();

      if (restored) {
        return;
      }

      if (shouldRefreshSessionSoon() && getLastProjectRef()) {
        refreshBuilderSessionViaStudioPopup();
      }
    })();
  }, BUILDER_SESSION_KEEPALIVE_MS);

  return () => {
    window.removeEventListener('message', onMessage);
    window.clearInterval(intervalId);
  };
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

export function getBuilderMcpTokenTtlSeconds() {
  return BUILDER_MCP_TOKEN_TTL_SECONDS;
}
