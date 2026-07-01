import { atom } from 'nanostores';
import type {
  IndobaseBackendApiKey,
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

export type IndobaseBackendProject = import('~/types/indobase-backend').IndobaseBackendProject;

export interface IndobaseConnectionState {
  user: IndobaseBackendUser | null;
  token: string;
  stats?: IndobaseBackendStats;
  selectedProjectId?: string;
  isConnected?: boolean;
  project?: IndobaseBackendProject;
  credentials?: IndobaseBackendCredentials;
  connectionSource?: 'manual' | 'studio_handoff';
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

/** @deprecated Use IndobaseConnectionState */
export type IndobaseConnectionState = IndobaseConnectionState;
/** @deprecated Use IndobaseBackendProject */
export type SupabaseProject = IndobaseBackendProject;

function resolveApiUrl(credentials?: IndobaseBackendCredentials) {
  return credentials?.apiUrl || credentials?.supabaseUrl;
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
    initialState.credentials = JSON.parse(savedCredentials);
  } catch (e) {
    console.error('Failed to parse saved Indobase credentials:', e);
  }
}

export const indobaseConnection = atom<IndobaseConnectionState>(initialState);
/** @deprecated Use indobaseConnection */
export const supabaseConnection = indobaseConnection;

export const isConnecting = atom(false);
export const isFetchingStats = atom(false);
export const isFetchingApiKeys = atom(false);

if (initialState.token && !initialState.stats) {
  fetchIndobaseBackendStats(initialState.token).catch(console.error);
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

  const isManualConnection = Boolean(nextUser && nextToken);
  const isStudioManagedConnection =
    nextConnectionSource === 'studio_handoff' &&
    Boolean(nextSelectedProjectId && resolveApiUrl(nextCredentials) && nextCredentials?.anonKey);

  connection.isConnected = isManualConnection || isStudioManagedConnection;

  if (connection.selectedProjectId !== undefined) {
    if (connection.selectedProjectId && nextStats?.projects) {
      const selectedProject = nextStats.projects.find((project) => project.id === connection.selectedProjectId);

      if (selectedProject) {
        connection.project = selectedProject;
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
      connection.connectionSource = undefined;
    }
  }

  const newState = { ...currentState, ...connection };
  indobaseConnection.set(newState);

  if (connection.user || connection.token || connection.selectedProjectId !== undefined || connection.credentials) {
    writeStoredConnectionRaw(JSON.stringify(newState));

    if (newState.credentials) {
      writeStoredCredentialsRaw(JSON.stringify(newState.credentials));
    } else {
      const storage =
        typeof globalThis !== 'undefined' && globalThis.localStorage ? globalThis.localStorage : null;
      storage?.removeItem('indobase_credentials');
      storage?.removeItem('supabaseCredentials');
    }
  } else {
    clearStoredConnection();
  }

  dispatchIndobaseConnectionChanged();
}

/** @deprecated Use updateIndobaseConnection */
export const updateSupabaseConnection = updateIndobaseConnection;

export function initializeIndobaseConnection() {
  const envToken =
    import.meta.env?.VITE_INDOBASE_ACCESS_TOKEN?.trim() || import.meta.env?.VITE_SUPABASE_ACCESS_TOKEN?.trim();

  if (envToken && !indobaseConnection.get().token && !indobaseConnection.get().isConnected) {
    updateIndobaseConnection({ token: envToken });
    fetchIndobaseBackendStats(envToken).catch(console.error);
  }
}

/** @deprecated Use initializeIndobaseConnection */
export const initializeSupabaseConnection = initializeIndobaseConnection;

export async function fetchIndobaseBackendStats(token: string) {
  isFetchingStats.set(true);

  try {
    const response = await fetch('/api/supabase', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        token,
      }),
    });

    if (!response.ok) {
      throw new Error('Failed to fetch projects');
    }

    const data = (await response.json()) as any;

    updateIndobaseConnection({
      user: data.user,
      stats: data.stats,
    });
  } catch (error) {
    console.error('Failed to fetch Indobase backend stats:', error);
    throw error;
  } finally {
    isFetchingStats.set(false);
  }
}

/** @deprecated Use fetchIndobaseBackendStats */
export const fetchSupabaseStats = fetchIndobaseBackendStats;

export async function fetchProjectApiKeys(projectId: string, token: string) {
  isFetchingApiKeys.set(true);

  try {
    const response = await fetch('/api/supabase/variables', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        projectId,
        token,
      }),
    });

    if (!response.ok) {
      throw new Error('Failed to fetch API keys');
    }

    const data = (await response.json()) as any;
    const apiKeys = data.apiKeys;

    const anonKey = apiKeys.find((key: IndobaseBackendApiKey) => key.name === 'anon' || key.name === 'public');

    if (anonKey) {
      const apiUrl = `https://${projectId}.indobase.in`;

      updateIndobaseConnection({
        credentials: {
          anonKey: anonKey.api_key,
          apiUrl,
          supabaseUrl: apiUrl,
        },
      });

      return { anonKey: anonKey.api_key, apiUrl, supabaseUrl: apiUrl };
    }

    return null;
  } catch (error) {
    console.error('Failed to fetch project API keys:', error);
    throw error;
  } finally {
    isFetchingApiKeys.set(false);
  }
}
