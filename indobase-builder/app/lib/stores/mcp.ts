import { create } from 'zustand';
import type { MCPConfig, MCPServerTools } from '~/lib/services/mcpService';
import { getAutoIndobaseMcpConfig, mergeMcpConfigWithIndobase } from '~/lib/indobase/mcp';
import { scheduleIdleWork } from '~/utils/scheduleIdleWork';
import { builderFetch } from '~/lib/indobase/builder-auth.client';

const MCP_SETTINGS_KEY = 'mcp_settings';
const isBrowser = typeof window !== 'undefined';
let hasBoundIndobaseConnectionListener = false;

type MCPSettings = {
  mcpConfig: MCPConfig;
  maxLLMSteps: number;
};

const defaultSettings = {
  maxLLMSteps: 5,
  mcpConfig: {
    mcpServers: {},
  },
} satisfies MCPSettings;

type Store = {
  isInitialized: boolean;
  settings: MCPSettings;
  serverTools: MCPServerTools;
  error: string | null;
  isUpdatingConfig: boolean;
};

type Actions = {
  initialize: () => Promise<void>;
  updateSettings: (settings: MCPSettings) => Promise<void>;
  checkServersAvailabilities: () => Promise<void>;
  syncWithIndobaseConnection: () => Promise<void>;
};

export const useMCPStore = create<Store & Actions>((set, get) => ({
  isInitialized: false,
  settings: defaultSettings,
  serverTools: {},
  error: null,
  isUpdatingConfig: false,
  initialize: async () => {
    if (get().isInitialized) {
      return;
    }

    const hasIndobaseHandoff = Boolean(getAutoIndobaseMcpConfig());

    if (!hasIndobaseHandoff) {
      await new Promise<void>((resolve) => {
        scheduleIdleWork(() => resolve(), 5000);
      });
    }

    if (get().isInitialized) {
      return;
    }

    if (isBrowser) {
      const savedConfig = localStorage.getItem(MCP_SETTINGS_KEY);

      if (savedConfig) {
        try {
          const settings = JSON.parse(savedConfig) as MCPSettings;
          const serverTools = await updateServerConfig(mergeMcpConfigWithIndobase(settings.mcpConfig));
          set(() => ({ settings, serverTools }));
        } catch (error) {
          console.error('Error parsing saved mcp config:', error);
          set(() => ({
            error: `Error parsing saved mcp config: ${error instanceof Error ? error.message : String(error)}`,
          }));
        }
      } else {
        localStorage.setItem(MCP_SETTINGS_KEY, JSON.stringify(defaultSettings));

        const serverTools = await updateServerConfig(mergeMcpConfigWithIndobase(defaultSettings.mcpConfig));
        set(() => ({ settings: defaultSettings, serverTools }));
      }

      if (!hasBoundIndobaseConnectionListener) {
        window.addEventListener('indobase:supabase-connection-changed', () => {
          useMCPStore
            .getState()
            .syncWithIndobaseConnection()
            .catch((error) => {
              console.error('Failed to sync Indobase MCP connection:', error);
            });
        });
        hasBoundIndobaseConnectionListener = true;
      }
    }

    set(() => ({ isInitialized: true }));
  },
  updateSettings: async (newSettings: MCPSettings) => {
    if (get().isUpdatingConfig) {
      return;
    }

    try {
      set(() => ({ isUpdatingConfig: true }));

      const serverTools = await updateServerConfig(mergeMcpConfigWithIndobase(newSettings.mcpConfig));

      if (isBrowser) {
        localStorage.setItem(MCP_SETTINGS_KEY, JSON.stringify(newSettings));
      }

      set(() => ({ settings: newSettings, serverTools }));
    } catch (error) {
      throw error;
    } finally {
      set(() => ({ isUpdatingConfig: false }));
    }
  },
  checkServersAvailabilities: async () => {
    const response = await builderFetch('/api/mcp-check', {
      method: 'GET',
    });

    if (!response.ok) {
      throw new Error(`Server responded with ${response.status}: ${response.statusText}`);
    }

    const serverTools = (await response.json()) as MCPServerTools;

    set(() => ({ serverTools }));
  },
  syncWithIndobaseConnection: async () => {
    const settings = get().settings;
    const serverTools = await updateServerConfig(mergeMcpConfigWithIndobase(settings.mcpConfig));
    set(() => ({ serverTools }));
  },
}));

async function updateServerConfig(config: MCPConfig) {
  const response = await builderFetch('/api/mcp-update-config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });

  if (!response.ok) {
    throw new Error(`Server responded with ${response.status}: ${response.statusText}`);
  }

  const data = (await response.json()) as MCPServerTools;

  return data;
}
