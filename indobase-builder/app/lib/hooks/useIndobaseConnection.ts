import { useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import { useStore } from '@nanostores/react';
import { logStore } from '~/lib/stores/logs';
import {
  indobaseConnection,
  isConnecting,
  isFetchingStats,
  isFetchingApiKeys,
  updateIndobaseConnection,
  fetchProjectApiKeys,
  initializeIndobaseConnection,
} from '~/lib/stores/indobase-connection';
import {
  readStoredConnectionRaw,
  readStoredCredentialsRaw,
} from '~/lib/indobase/connection-storage';

export function useIndobaseConnection() {
  const connection = useStore(indobaseConnection);
  const connecting = useStore(isConnecting);
  const fetchingStats = useStore(isFetchingStats);
  const fetchingApiKeys = useStore(isFetchingApiKeys);
  const [isProjectsExpanded, setIsProjectsExpanded] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  useEffect(() => {
    const initConnection = async () => {
      try {
        await initializeIndobaseConnection();
      } catch {
        // fall through to localStorage
      }

      const savedConnection = readStoredConnectionRaw();
      const savedCredentials = readStoredCredentialsRaw();

      if (savedConnection) {
        const parsed = JSON.parse(savedConnection);

        if (savedCredentials && !parsed.credentials) {
          parsed.credentials = JSON.parse(savedCredentials);
        }

        const currentState = indobaseConnection.get();

        if (!currentState.user) {
          updateIndobaseConnection(parsed);
        }

        if (parsed.token && parsed.selectedProjectId && !parsed.credentials) {
          fetchProjectApiKeys(parsed.selectedProjectId, parsed.token).catch(console.error);
        }
      }
    };

    initConnection();
  }, []);

  const handleConnect = async () => {
    isConnecting.set(true);

    try {
      const cleanToken = connection.token.trim();

      const response = await fetch('/api/supabase', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          token: cleanToken,
        }),
      });

      const data = (await response.json()) as any;

      if (!response.ok) {
        throw new Error(data.error || 'Failed to connect');
      }

      updateIndobaseConnection({
        user: data.user,
        token: connection.token,
        stats: data.stats,
      });

      toast.success('Successfully connected to Indobase backend');

      setIsProjectsExpanded(true);

      return true;
    } catch (error) {
      console.error('Connection error:', error);
      logStore.logError('Failed to authenticate with Indobase backend', { error });
      toast.error(error instanceof Error ? error.message : 'Failed to connect to Indobase backend');
      updateIndobaseConnection({ user: null, token: '' });

      return false;
    } finally {
      isConnecting.set(false);
    }
  };

  const handleDisconnect = () => {
    updateIndobaseConnection({
      user: null,
      token: '',
      stats: undefined,
      selectedProjectId: undefined,
      isConnected: false,
      project: undefined,
      credentials: undefined,
      connectionSource: undefined,
      indobase: undefined,
    });
    toast.success('Disconnected from Indobase backend');
    setIsDropdownOpen(false);
  };

  const selectProject = async (projectId: string) => {
    const currentState = indobaseConnection.get();
    let projectData = undefined;

    if (projectId && currentState.stats?.projects) {
      projectData = currentState.stats.projects.find((project) => project.id === projectId);
    }

    updateIndobaseConnection({
      selectedProjectId: projectId,
      project: projectData,
    });

    if (projectId && currentState.token) {
      try {
        await fetchProjectApiKeys(projectId, currentState.token);
        toast.success('Project selected successfully');
      } catch (error) {
        console.error('Failed to fetch API keys:', error);
        toast.error('Selected project but failed to fetch API keys');
      }
    } else {
      toast.success('Project selected successfully');
    }

    setIsDropdownOpen(false);
  };

  const handleCreateProject = async () => {
    window.open('https://studio.indobase.in', '_blank');
  };

  return {
    connection,
    connecting,
    fetchingStats,
    fetchingApiKeys,
    isProjectsExpanded,
    setIsProjectsExpanded,
    isDropdownOpen,
    setIsDropdownOpen,
    handleConnect,
    handleDisconnect,
    selectProject,
    handleCreateProject,
    updateToken: (token: string) => updateIndobaseConnection({ ...connection, token }),
    isConnected: Boolean(connection.isConnected),
    fetchProjectApiKeys: (projectId: string) => {
      if (connection.token) {
        return fetchProjectApiKeys(projectId, connection.token);
      }

      return Promise.reject(new Error('No token available'));
    },
  };
}

/** @deprecated Use useIndobaseConnection */
export const useSupabaseConnection = useIndobaseConnection;
