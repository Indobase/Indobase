import { createOpenAI, openai } from '@ai-sdk/openai'
import { LanguageModel } from 'ai'
import { checkAwsCredentials, createRoutedBedrock } from './bedrock'
import {
  BedrockModel,
  GroqModel,
  Model,
  OpenAIModel,
  PROVIDERS,
  ProviderModelConfig,
  ProviderName,
  getDefaultModelForProvider,
} from './model.utils'

type PromptProviderOptions = Record<string, any>
type ProviderOptions = Record<string, any>

type ModelSuccess = {
  model: LanguageModel
  promptProviderOptions?: PromptProviderOptions
  providerOptions?: ProviderOptions
  error?: never
}

export type ModelError = {
  model?: never
  promptProviderOptions?: never
  providerOptions?: never
  error: Error
}

type ModelResponse = ModelSuccess | ModelError

export const ModelErrorMessage = 'No valid AI model available based on available credentials.'

export type GetModelParams = {
  provider?: ProviderName
  model?: Model
  routingKey: string
  isLimited?: boolean
}

/**
 * Retrieves a LanguageModel from a specific provider and model.
 * - If provider/model not specified, auto-selects based on available credentials (prefers Bedrock).
 * - If isLimited is true, uses the provider's default model.
 * - Returns promptProviderOptions that callers can attach to the system message.
 */
export async function getModel({
  provider,
  model,
  routingKey,
  isLimited = true,
}: GetModelParams): Promise<ModelResponse> {
  const envThrottled = process.env.IS_THROTTLED !== 'false'

  let preferredProvider: ProviderName | undefined = provider

  const hasAwsCredentials = await checkAwsCredentials()
  const hasAwsBedrockRoleArn = !!process.env.AWS_BEDROCK_ROLE_ARN
  const hasOpenAIKey = !!process.env.OPENAI_API_KEY
  const hasGroqKey = !!process.env.GROQ_API_KEY

  const hasBedrock = hasAwsBedrockRoleArn && hasAwsCredentials

  // Whether the credentials for a given provider are actually present.
  const providerIsAvailable = (p: ProviderName | undefined): boolean => {
    if (p === 'bedrock') return hasBedrock
    if (p === 'openai') return hasOpenAIKey
    if (p === 'groq') return hasGroqKey
    return false
  }

  // Auto-pick a provider if none was specified, or if the requested provider
  // has no credentials available (so a route asking for 'openai' still works
  // on a Groq-only deployment). Preference order: Bedrock, OpenAI, then Groq.
  if (!providerIsAvailable(preferredProvider)) {
    if (hasBedrock) {
      preferredProvider = 'bedrock'
    } else if (hasOpenAIKey) {
      preferredProvider = 'openai'
    } else if (hasGroqKey) {
      preferredProvider = 'groq'
    } else {
      preferredProvider = undefined
    }
  }

  if (!preferredProvider) {
    return { error: new Error(ModelErrorMessage) }
  }

  const providerRegistry = PROVIDERS[preferredProvider]
  if (!providerRegistry) {
    return { error: new Error(`Unknown provider: ${preferredProvider}`) }
  }

  const models = providerRegistry.models as Record<Model, ProviderModelConfig>

  const useDefault = isLimited || envThrottled || !model || !models[model]

  const chosenModelId = useDefault ? getDefaultModelForProvider(preferredProvider) : model

  if (preferredProvider === 'bedrock') {
    if (!hasAwsBedrockRoleArn || !hasAwsCredentials) {
      return { error: new Error('AWS Bedrock credentials not available') }
    }
    const bedrock = createRoutedBedrock(routingKey)
    const model = await bedrock(chosenModelId as BedrockModel)
    const promptProviderOptions = (
      providerRegistry.models as Record<BedrockModel, ProviderModelConfig>
    )[chosenModelId as BedrockModel]?.promptProviderOptions
    return { model, promptProviderOptions }
  }

  if (preferredProvider === 'groq') {
    if (!hasGroqKey) {
      return { error: new Error('GROQ_API_KEY not available') }
    }
    // Groq exposes an OpenAI-compatible API; reuse the OpenAI provider pointed
    // at Groq's base URL. .chat() forces the /chat/completions route — Groq has
    // no /responses endpoint.
    const groq = createOpenAI({
      baseURL: 'https://api.groq.com/openai/v1',
      apiKey: process.env.GROQ_API_KEY,
    })
    return {
      model: groq.chat(chosenModelId as GroqModel),
      promptProviderOptions: models[chosenModelId as GroqModel]?.promptProviderOptions,
    }
  }

  if (preferredProvider === 'openai') {
    if (!hasOpenAIKey) {
      return { error: new Error('OPENAI_API_KEY not available') }
    }
    return {
      model: openai(chosenModelId as OpenAIModel),
      promptProviderOptions: models[chosenModelId as OpenAIModel]?.promptProviderOptions,
      providerOptions: providerRegistry.providerOptions,
    }
  }

  return { error: new Error(`Unsupported provider: ${preferredProvider}`) }
}
