import type { IndobaseConnectionState } from '~/lib/stores/indobase-connection';
import { updateIndobaseConnection } from '~/lib/stores/indobase-connection';
import { syncProfileFromStudioIdentity } from '~/lib/stores/profile';
import { getStoredIndobaseConnection } from '~/lib/indobase/mcp';
import type { BuilderBackendConfigResponse } from './backendConfig';
import { hasIndobaseStudioHandoff, isIndobaseStudioManagedConnection } from './connection';
import {
  BUILDER_LAST_PROJECT_REF_KEY,
  BUILDER_MCP_TOKEN_TTL_SECONDS,
  BUILDER_SESSION_KEEPALIVE_MS,
  BUILDER_SESSION_REFRESH_LEAD_MS,
} from './builder-session.constants';

const DEFAULT_STUDIO_URL = 'https://studio.indobase.in';

type SessionResponse = {
  email?: string;
  error?: string;
  expiresAt?: number;
  mcpToken?: string;
  organizationSlug?: string;
  projectRef?: string;
  statusCode?: number;
  studioUrl?: string;
  sub?: string;
  success?: boolean;
};

export function getStoredIndobaseConnectionFromAuth(): IndobaseConnectionState | null {
  return getStoredIndobaseConnection();
}

export function getLastProjectRef(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const stored = window.localStorage.getItem(BUILDER_LAST_PROJECT_REF_KEY)?.trim();
  if (stored) {
    return stored;
  }

  const connection = getStoredIndobaseConnectionFromAuth();
  return connection?.indobase?.projectRef || connection?.selectedProjectId || null;
}

export function persistLastProjectRef(projectRef: string) {
  if (typeof window === 'undefined' || !projectRef.trim()) {
    return;
  }

  window.localStorage.setItem(BUILDER_LAST_PROJECT_REF_KEY, projectRef.trim());
}

export function getStoredBuilderMcpToken(): string | null {
  const connection = getStoredIndobaseConnectionFromAuth();

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

export function getStudioOrigin(connection?: IndobaseConnectionState | null): string {
  return connection?.indobase?.studioUrl?.replace(/\/+$/, '') || DEFAULT_STUDIO_URL;
}

export function getStudioBuilderConnectUrl(options?: {
  connection?: IndobaseConnectionState | null;
  projectRef?: string;
  returnTo?: string;
  popup?: boolean;
}): string {
  const connection = options?.connection ?? getStoredIndobaseConnectionFromAuth();
  const studioUrl = getStudioOrigin(connection);
  const projectRef =
    options?.projectRef ||
    connection?.indobase?.projectRef ||
    connection?.selectedProjectId ||
    getLastProjectRef() ||
    '';

  const returnTo = options?.returnTo || (typeof window !== 'undefined' ? window.location.pathname : '/');

  if (!projectRef) {
    const params = new URLSearchParams();
    params.set('return_to', returnTo);
    if (options?.popup) {
      params.set('popup', '1');
    }
    const suffix = params.toString() ? `?${params.toString()}` : '';
    return `${studioUrl}/builder/connect${suffix}`;
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

async function rebuildConnectionFromBackendConfig(session: SessionResponse): Promise<void> {
  /*
   * No stored handoff connection (e.g. localStorage cleared): the MCP cookie is still valid,
   * so fetch the tenant backend config from Studio and reconstruct a full connection instead of
   * forcing a fresh Studio launch. Dynamic import avoids a static cycle with this module.
   */
  if (!session.projectRef || !session.studioUrl) {
    return;
  }

  const response = await fetch(
    '/api/indobase/backend',
    getBuilderRequestInit({
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        projectRef: session.projectRef,
        studioUrl: session.studioUrl,
        mcpToken: session.mcpToken,
      }),
    }),
  );

  if (!response.ok) {
    return;
  }

  const { buildConnectionFromSessionAndBackend } = await import('./backendConfig');
  const backendData = (await response.json().catch(() => null)) as BuilderBackendConfigResponse | null;

  if (!backendData?.backend?.anon_key) {
    return;
  }

  const rebuilt = buildConnectionFromSessionAndBackend(
    {
      email: session.email,
      mcpToken: session.mcpToken,
      projectRef: session.projectRef,
      studioUrl: session.studioUrl,
      organizationSlug: session.organizationSlug,
      sub: session.sub,
    },
    backendData,
  );

  if (!rebuilt) {
    return;
  }

  persistLastProjectRef(session.projectRef);
  updateIndobaseConnection(rebuilt);
  syncProfileFromStudioIdentity({ email: session.email, sub: session.sub });
}

async function applySessionToStoredConnection(session: SessionResponse): Promise<void> {
  if (!session.mcpToken) {
    return;
  }

  syncProfileFromStudioIdentity({ email: session.email, sub: session.sub });

  const connection = getStoredIndobaseConnectionFromAuth();

  if (!connection || connection.connectionSource !== 'studio_handoff') {
    await rebuildConnectionFromBackendConfig(session);
    return;
  }

  const projectRef = session.projectRef || connection.indobase?.projectRef || connection.selectedProjectId || '';
  persistLastProjectRef(projectRef);

  const email = session.email?.trim() || connection.user?.email || '';
  const sub = session.sub?.trim() || connection.user?.id || '';

  updateIndobaseConnection({
    isConnected: true,
    connectionSource: 'studio_handoff',
    selectedProjectId: projectRef || connection.selectedProjectId,
    ...(email
      ? {
          user: {
            id: sub || email,
            email,
            role: 'indobase_builder',
            created_at: connection.user?.created_at || new Date().toISOString(),
            last_sign_in_at: new Date().toISOString(),
          },
        }
      : {}),
    indobase: {
      apiUrl: connection.indobase?.apiUrl || connection.credentials?.apiUrl || '',
      authUrl: connection.indobase?.authUrl || `${connection.credentials?.apiUrl || ''}/auth/v1`,
      organizationSlug: session.organizationSlug || connection.indobase?.organizationSlug || '',
      projectRef,
      projectUrl: connection.indobase?.projectUrl || '',
      restUrl: connection.indobase?.restUrl || `${connection.credentials?.apiUrl || ''}/rest/v1/`,
      storageUrl: connection.indobase?.storageUrl || `${connection.credentials?.apiUrl || ''}/storage/v1`,
      studioUrl: session.studioUrl || connection.indobase?.studioUrl || DEFAULT_STUDIO_URL,
      mcpToken: session.mcpToken,
    },
  });
}

export function clearStaleBuilderSession() {
  const connection = getStoredIndobaseConnectionFromAuth();

  if (!connection?.indobase) {
    return;
  }

  // Keep Studio handoff credentials; only drop the MCP token so the next session refresh can recover.
  updateIndobaseConnection({
    indobase: {
      ...connection.indobase,
      mcpToken: undefined,
    },
  });
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function ensureBuilderSession(options?: { retries?: number }): Promise<boolean> {
  const retries = Math.max(0, options?.retries ?? 2);

  for (let attempt = 0; attempt <= retries; attempt++) {
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
        await applySessionToStoredConnection(data);
        return true;
      }

      if (response.status === 401) {
        clearStaleBuilderSession();
        return false;
      }

      // Transient server/network failure — retry before giving up.
      if (attempt < retries) {
        await sleep(400 * (attempt + 1));
        continue;
      }

      return false;
    } catch {
      if (attempt < retries) {
        await sleep(400 * (attempt + 1));
        continue;
      }

      return false;
    }
  }

  return false;
}

export async function restoreBuilderSessionOnLoad(): Promise<boolean> {
  return ensureBuilderSession();
}

let refreshPopup: Window | null = null;
let refreshIframe: HTMLIFrameElement | null = null;

function ensureSessionRefreshIframe(): HTMLIFrameElement {
  if (refreshIframe && document.body.contains(refreshIframe)) {
    return refreshIframe;
  }

  refreshIframe = document.createElement('iframe');
  refreshIframe.id = 'indobase-builder-session-iframe';
  refreshIframe.title = 'Indobase session refresh';
  refreshIframe.setAttribute('aria-hidden', 'true');
  refreshIframe.tabIndex = -1;
  refreshIframe.style.cssText =
    'position:absolute;width:0;height:0;border:0;clip:rect(0 0 0 0);overflow:hidden;';
  document.body.appendChild(refreshIframe);
  return refreshIframe;
}

export function refreshBuilderSessionViaStudioIframe(returnTo?: string): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  const url = getStudioBuilderConnectUrl({
    returnTo: returnTo || `${window.location.pathname}${window.location.search}`,
    popup: true,
  });

  const iframe = ensureSessionRefreshIframe();
  iframe.src = url;
  return true;
}

export function refreshBuilderSessionViaStudioPopup(returnTo?: string): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  // Prefer a hidden iframe — popup blockers break silent session refresh in production.
  if (refreshBuilderSessionViaStudioIframe(returnTo)) {
    return true;
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
    /*
     * The session-refresh popup ends up on the Builder origin before it notifies us,
     * so this is a same-origin message — not one from Studio.
     */
    if (event.origin !== window.location.origin) {
      return;
    }

    if (event.data?.type === 'indobase-builder-session' && event.data?.success) {
      if (refreshIframe) {
        refreshIframe.src = 'about:blank';
      }
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

/** Ensure MCP session + tools are ready before a Studio-linked chat request. */
export async function prepareStudioLinkedChat(): Promise<boolean> {
  const connection = getStoredIndobaseConnectionFromAuth();

  if (!hasIndobaseStudioHandoff(connection)) {
    return true;
  }

  const restored = await ensureBuilderSession({ retries: 2 });

  if (!restored) {
    // Network blips must not force a Studio reconnect while a token is still present.
    if (!getStoredBuilderMcpToken()) {
      return false;
    }
  }

  try {
    const { useMCPStore } = await import('~/lib/stores/mcp');
    await useMCPStore.getState().initialize();
    await useMCPStore.getState().syncWithIndobaseConnection();
  } catch {
    // Chat can still proceed; MCP tools may recover on the next turn.
  }

  return true;
}
