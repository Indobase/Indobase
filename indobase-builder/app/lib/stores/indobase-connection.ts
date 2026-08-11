import { atom } from 'nanostores';
import type {
  IndobaseBackendCredentials,
  IndobaseBackendStats,
  IndobaseBackendUser,
} from '~/types/indobase-backend';
import {
  clearStoredConnection,
  dispatchIndobaseConnectionChanged,
  readStoredConnectionRaw,
  readStoredCredentialsRaw,
  writeStoredConnectionRaw,
  writeStoredCredentialsRaw,
} from '~/lib/indobase/connection-storage';
import { getBuilderRequestInit } from '~/lib/indobase/builder-auth.client';

export type IndobaseBackendProject = import('~/types/indobase-backend').IndobaseBackendProject;

export type BuilderBackendProvider = 'indobase' | 'pocketbase';

export type PocketBaseConnection = {
  url: string;
  /** Stable app scope for collection names on the shared managed instance. */
  appId?: string;
};

export interface IndobaseConnectionState {
  user: IndobaseBackendUser | null;
  token: string;
  stats?: IndobaseBackendStats;
  selectedProjectId?: string;
  isConnected?: boolean;
  project?: IndobaseBackendProject;
  credentials?: IndobaseBackendCredentials;
  /** Which app backend Builder should generate against. */
  backendProvider?: BuilderBackendProvider;
  connectionSource?: 'manual' | 'studio_handoff' | 'pocketbase';
  pocketbase?: PocketBaseConnection;
  indobase?: {
    apiUrl: string;
    authUrl: string;
    mcpToken?: string;
    organizationSlug: string;
    projectRef: string;
    projectUrl: string;
    restUrl: string;
    storageUrl: string;
    studioUrl: string;
  };
}

function resolveApiUrl(credentials?: IndobaseBackendCredentials) {
  return credentials?.apiUrl;
}

const savedConnection = readStoredConnectionRaw();
const savedCredentials = readStoredCredentialsRaw();

const initialState: IndobaseConnectionState = savedConnection
  ? JSON.parse(savedConnection)
  : {
      user: null,
      token: '',
      stats: undefined,
      selectedProjectId: undefined,
      isConnected: false,
      project: undefined,
    };

if (savedCredentials && !initialState.credentials) {
  try {
    const parsed = JSON.parse(savedCredentials) as IndobaseBackendCredentials;
    initialState.credentials = {
      anonKey: parsed.anonKey,
      apiUrl: parsed.apiUrl,
    };
  } catch (e) {
    console.error('Failed to parse saved Indobase credentials:', e);
  }
}

export const indobaseConnection = atom<IndobaseConnectionState>(initialState);

export const isConnecting = atom(false);
export const isFetchingStats = atom(false);
export const isFetchingApiKeys = atom(false);

if (initialState.connectionSource === 'studio_handoff' && !initialState.stats) {
  fetchIndobaseBackendStats().catch(console.error);
}

export function updateIndobaseConnection(connection: Partial<IndobaseConnectionState>) {
  const currentState = indobaseConnection.get();

  const nextUser = connection.user !== undefined ? connection.user : currentState.user;
  const nextToken = connection.token !== undefined ? connection.token : currentState.token;
  const nextSelectedProjectId =
    connection.selectedProjectId !== undefined ? connection.selectedProjectId : currentState.selectedProjectId;
  const nextStats = connection.stats !== undefined ? connection.stats : currentState.stats;
  const nextCredentials = connection.credentials !== undefined ? connection.credentials : currentState.credentials;
  const nextConnectionSource =
    connection.connectionSource !== undefined ? connection.connectionSource : currentState.connectionSource;
  const nextBackendProvider =
    connection.backendProvider !== undefined ? connection.backendProvider : currentState.backendProvider;
  const nextPocketbase = connection.pocketbase !== undefined ? connection.pocketbase : currentState.pocketbase;

  const hasValidCredentials = Boolean(
    nextSelectedProjectId && resolveApiUrl(nextCredentials) && nextCredentials?.anonKey,
  );
  const isStudioManagedConnection =
    nextConnectionSource === 'studio_handoff' &&
    nextBackendProvider !== 'pocketbase' &&
    hasValidCredentials;

  // A manually-entered project URL + anon key is enough to talk to the backend
  // (DB/auth/storage, .env seeding). Studio handoff additionally unlocks
  // publish, MCP and prompt quota, but a manual connection is still "connected".
  const isManualConnection =
    nextConnectionSource === 'manual' && nextBackendProvider !== 'pocketbase' && hasValidCredentials;

  const isPocketBaseConnection =
    (nextConnectionSource === 'pocketbase' || nextBackendProvider === 'pocketbase') &&
    Boolean(nextPocketbase?.url?.trim());

  connection.isConnected = isStudioManagedConnection || isManualConnection || isPocketBaseConnection;

  if (connection.selectedProjectId !== undefined) {
    if (connection.selectedProjectId && nextStats?.projects) {
      const selectedProject = nextStats.projects.find((project) => project.id === connection.selectedProjectId);

      if (selectedProject) {
        connection.project = selectedProject;
      } else if (nextBackendProvider === 'pocketbase' || nextConnectionSource === 'pocketbase') {
        connection.project = {
          id: connection.selectedProjectId,
          name: 'Indobase backend',
          region: 'indobase',
          organization_id: '',
          status: 'active',
          created_at: new Date().toISOString(),
        };
      } else {
        connection.project = {
          id: connection.selectedProjectId,
          name: `Project ${connection.selectedProjectId.substring(0, 8)}...`,
          region: 'unknown',
          organization_id: '',
          status: 'active',
          created_at: new Date().toISOString(),
        };
      }
    } else if (connection.selectedProjectId === '') {
      connection.project = undefined;
      connection.credentials = undefined;
      connection.indobase = undefined;
      connection.pocketbase = undefined;
      connection.backendProvider = undefined;
      connection.connectionSource = undefined;
    }
  }

  const newState = { ...currentState, ...connection };
  indobaseConnection.set(newState);

  if (
    connection.user ||
    connection.token ||
    connection.selectedProjectId !== undefined ||
    connection.credentials ||
    connection.pocketbase ||
    connection.backendProvider !== undefined
  ) {
    writeStoredConnectionRaw(JSON.stringify(newState));

    if (newState.credentials) {
      writeStoredCredentialsRaw(JSON.stringify(newState.credentials));
    } else {
      const storage =
        typeof globalThis !== 'undefined' && globalThis.localStorage ? globalThis.localStorage : null;
      storage?.removeItem('indobase_credentials');
    }
  } else {
    clearStoredConnection();
  }

  dispatchIndobaseConnectionChanged();
}

export function initializeIndobaseConnection() {
  if (indobaseConnection.get().connectionSource === 'studio_handoff') {
    fetchIndobaseBackendStats().catch(console.error);
  }
}

export async function fetchIndobaseBackendStats(_token?: string) {
  isFetchingStats.set(true);

  try {
    const response = await fetch('/api/indobase/connection-status', getBuilderRequestInit());

    if (!response.ok) {
      throw new Error('Failed to fetch Indobase backend status');
    }

    const data = (await response.json()) as {
      projects?: IndobaseBackendProject[];
      projectRef?: string;
    };

    updateIndobaseConnection({
      user: {
        id: data.projectRef || 'indobase',
        email: 'Connected from Indobase Studio',
        role: 'indobase_builder',
        created_at: new Date().toISOString(),
        last_sign_in_at: new Date().toISOString(),
      },
      stats: {
        projects: data.projects || [],
        totalProjects: data.projects?.length || 0,
      },
    });
  } catch (error) {
    console.error('Failed to fetch Indobase backend stats:', error);
    throw error;
  } finally {
    isFetchingStats.set(false);
  }
}

export async function fetchProjectApiKeys(projectId: string, _token?: string) {
  isFetchingApiKeys.set(true);

  try {
    const connection = indobaseConnection.get();

    if (connection.connectionSource !== 'studio_handoff' || !connection.credentials?.anonKey) {
      throw new Error('Open Builder from Indobase Studio to load project API keys.');
    }

    const apiUrl = connection.credentials.apiUrl || connection.indobase?.apiUrl || `https://${projectId}.indobase.in`;

    updateIndobaseConnection({
      credentials: {
        anonKey: connection.credentials.anonKey,
        apiUrl,
      },
    });

    return { anonKey: connection.credentials.anonKey, apiUrl };
  } catch (error) {
    console.error('Failed to fetch project API keys:', error);
    throw error;
  } finally {
    isFetchingApiKeys.set(false);
  }
}
