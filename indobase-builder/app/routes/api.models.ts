import { json } from '@remix-run/cloudflare';
import { LLMManager } from '~/lib/modules/llm/manager';
import type { ModelInfo } from '~/lib/modules/llm/types';
import type { ProviderInfo } from '~/types/model';
import { getApiKeysFromCookie, getProviderSettingsFromCookie } from '~/lib/api/cookies';
import { filterOpenRouterFreeModels, OPENROUTER_PROVIDER_NAME } from '~/lib/indobase/openrouter-free-models';
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
        staticModels: provider.staticModels,
        getApiKeyLink: provider.getApiKeyLink,
        labelForGetApiKey: provider.labelForGetApiKey,
        icon: provider.icon,
      }));
  }

  if (!cachedDefaultProvider) {
    const defaultProvider = llmManager.getDefaultProvider();
    cachedDefaultProvider = {
      name: defaultProvider.name,
      staticModels: defaultProvider.staticModels,
      getApiKeyLink: defaultProvider.getApiKeyLink,
      labelForGetApiKey: defaultProvider.labelForGetApiKey,
      icon: defaultProvider.icon,
    };
  }

  return { providers: cachedProviders, defaultProvider: cachedDefaultProvider };
}

async function modelsLoader({
  request,
  params,
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

  // Get client side maintained API keys and provider settings from cookies
  const cookieHeader = request.headers.get('Cookie');
  const apiKeys = getApiKeysFromCookie(cookieHeader);
  const providerSettings = getProviderSettingsFromCookie(cookieHeader);

  const { providers, defaultProvider } = getProviderInfo(llmManager);

  let modelList: ModelInfo[] = [];

  if (params.provider) {
    if (params.provider !== OPENROUTER_PROVIDER_NAME) {
      modelList = [];
    } else {
      const provider = llmManager.getProvider(params.provider);

      if (provider) {
        modelList = await llmManager.getModelListFromProvider(provider, {
          apiKeys,
          providerSettings,
          serverEnv: context.cloudflare?.env,
        });
      }
    }
  } else {
    const fastBoot = context.cloudflare?.env?.BUILDER_FAST_MODEL_BOOT === 'true';

    if (fastBoot) {
      const openRouter = llmManager.getProvider('OpenRouter');

      if (openRouter) {
        modelList = await llmManager.getModelListFromProvider(openRouter, {
          apiKeys,
          providerSettings,
          serverEnv: context.cloudflare?.env,
        });
      } else {
        modelList = llmManager.getStaticModelList();
      }
    } else {
      // Update all models
      modelList = await llmManager.updateModelList({
        apiKeys,
        providerSettings,
        serverEnv: context.cloudflare?.env,
      });
    }
  }

  modelList = filterOpenRouterFreeModels(modelList);

  return json<ModelsResponse>({
    modelList,
    providers,
    defaultProvider,
  });
}

export const loader = withSecurity(modelsLoader, { requireAuth: true });
