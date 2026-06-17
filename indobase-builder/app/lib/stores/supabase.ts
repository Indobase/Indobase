import { atom } from 'nanostores';
import type { SupabaseUser, SupabaseStats, SupabaseApiKey, SupabaseCredentials } from '~/types/supabase';

export interface SupabaseProject {
  id: string;
  name: string;
  region: string;
  organization_id: string;
  status: string;
  database?: {
    host: string;
    version: string;
    postgres_engine: string;
    release_channel: string;
  };
  created_at: string;
  stats?: {
    database?: {
      tables: number;
      size: string;
      size_mb?: number;
      views?: number;
      functions?: number;
    };
    storage?: {
      objects: number;
      size: string;
      buckets?: number;
      files?: number;
      used_gb?: number;
      available_gb?: number;
    };
    functions?: {
      count: number;
      deployed?: number;
      invocations?: number;
    };
    auth?: {
      users: number;
    };
  };
}

export interface SupabaseConnectionState {
  user: SupabaseUser | null;
  token: string;
  stats?: SupabaseStats;
  selectedProjectId?: string;
  isConnected?: boolean;
  project?: SupabaseProject;
  credentials?: SupabaseCredentials;
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

const storage =
  typeof globalThis !== 'undefined' &&
  typeof globalThis.localStorage !== 'undefined' &&
  typeof globalThis.localStorage.getItem === 'function'
    ? globalThis.localStorage
    : null;

const savedConnection = storage ? storage.getItem('supabase_connection') : null;
const savedCredentials = storage ? storage.getItem('supabaseCredentials') : null;

const initialState: SupabaseConnectionState = savedConnection
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
    console.error('Failed to parse saved credentials:', e);
  }
}

export const supabaseConnection = atom<SupabaseConnectionState>(initialState);

export const isConnecting = atom(false);
export const isFetchingStats = atom(false);
export const isFetchingApiKeys = atom(false);

if (initialState.token && !initialState.stats) {
  fetchSupabaseStats(initialState.token).catch(console.error);
}

export function updateSupabaseConnection(connection: Partial<SupabaseConnectionState>) {
  const currentState = supabaseConnection.get();

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
    Boolean(nextSelectedProjectId && nextCredentials?.supabaseUrl && nextCredentials?.anonKey);

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
  supabaseConnection.set(newState);

  /*
   * Always save the connection state to localStorage to persist across chats
   */
  if (connection.user || connection.token || connection.selectedProjectId !== undefined || connection.credentials) {
    storage?.setItem('supabase_connection', JSON.stringify(newState));

    if (newState.credentials) {
      storage?.setItem('supabaseCredentials', JSON.stringify(newState.credentials));
    } else {
      storage?.removeItem('supabaseCredentials');
    }
  } else {
    storage?.removeItem('supabase_connection');
    storage?.removeItem('supabaseCredentials');
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('indobase:supabase-connection-changed'));
  }
}

export function initializeSupabaseConnection() {
  // Auto-connect using environment variable if available
  const envToken = import.meta.env?.VITE_SUPABASE_ACCESS_TOKEN;

  if (envToken && !supabaseConnection.get().token && !supabaseConnection.get().isConnected) {
    updateSupabaseConnection({ token: envToken });
    fetchSupabaseStats(envToken).catch(console.error);
  }
}

export async function fetchSupabaseStats(token: string) {
  isFetchingStats.set(true);

  try {
    // Use the internal API route instead of direct Supabase API call
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

    updateSupabaseConnection({
      user: data.user,
      stats: data.stats,
    });
  } catch (error) {
    console.error('Failed to fetch Supabase stats:', error);
    throw error;
  } finally {
    isFetchingStats.set(false);
  }
}

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

    const anonKey = apiKeys.find((key: SupabaseApiKey) => key.name === 'anon' || key.name === 'public');

    if (anonKey) {
      const supabaseUrl = `https://${projectId}.supabase.co`;

      updateSupabaseConnection({
        credentials: {
          anonKey: anonKey.api_key,
          supabaseUrl,
        },
      });

      return { anonKey: anonKey.api_key, supabaseUrl };
    }

    return null;
  } catch (error) {
    console.error('Failed to fetch project API keys:', error);
    throw error;
  } finally {
    isFetchingApiKeys.set(false);
  }
}
