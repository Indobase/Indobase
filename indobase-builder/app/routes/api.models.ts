import { json } from '@remix-run/cloudflare';
import { LLMManager } from '~/lib/modules/llm/manager';
import type { ModelInfo } from '~/lib/modules/llm/types';
import type { ProviderInfo } from '~/types/model';
import { OPENROUTER_PROVIDER_NAME } from '~/lib/indobase/openrouter-free-models';
import { withSecurity } from '~/lib/security';

interface ModelsResponse {
  modelList: ModelInfo[];
  providers: ProviderInfo[];
  defaultProvider: ProviderInfo;
}

let cachedProviders: ProviderInfo[] | null = null;
let cachedDefaultProvider: ProviderInfo | null = null;

function getProviderInfo(llmManager: LLMManager) {
  if (!cachedProviders) {
    cachedProviders = llmManager
      .getAllProviders()
      .filter((provider) => provider.name === OPENROUTER_PROVIDER_NAME)
      .map((provider) => ({
        name: provider.name,
        staticModels: [],
        getApiKeyLink: provider.getApiKeyLink,
        labelForGetApiKey: provider.labelForGetApiKey,
        icon: provider.icon,
      }));
  }

  if (!cachedDefaultProvider) {
    const defaultProvider = llmManager.getDefaultProvider();
    cachedDefaultProvider = {
      name: defaultProvider.name,
      staticModels: [],
      getApiKeyLink: defaultProvider.getApiKeyLink,
      labelForGetApiKey: defaultProvider.labelForGetApiKey,
      icon: defaultProvider.icon,
    };
  }

  return { providers: cachedProviders, defaultProvider: cachedDefaultProvider };
}

async function modelsLoader({
  context,
}: {
  request: Request;
  params: { provider?: string };
  context: {
    cloudflare?: {
      env: Record<string, string>;
    };
  };
}): Promise<Response> {
  const llmManager = LLMManager.getInstance(context.cloudflare?.env);
  const { providers, defaultProvider } = getProviderInfo(llmManager);

  // Models are routed server-side; never expose selectable model lists to the Builder UI.
  return json<ModelsResponse>({
    modelList: [],
    providers,
    defaultProvider,
  });
}

export const loader = withSecurity(modelsLoader, { requireAuth: true });
