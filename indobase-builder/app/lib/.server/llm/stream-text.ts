import {
  convertToCoreMessages,
  streamText as _streamText,
  tool,
  InvalidToolArgumentsError,
  NoSuchToolError,
  type Message,
} from 'ai';
import { z } from 'zod';
import { MAX_TOKENS, PROVIDER_COMPLETION_LIMITS, isReasoningModel, type FileMap } from './constants';
import { getSystemPrompt } from '~/lib/common/prompts/prompts';
import {
  DEFAULT_MODEL,
  DEFAULT_PROVIDER,
  MODIFICATIONS_TAG_NAME,
  PROVIDER_LIST,
  VISION_MODEL,
  WORK_DIR,
} from '~/utils/constants';
import { OPENROUTER_FREE_CODING_MODELS } from '~/lib/indobase/openrouter-coding-models';
import {
  isOpenRouterPaidCodegenModelId,
  resolveOpenRouterModelForTask,
  type OpenRouterTask,
} from '~/lib/indobase/openrouter-model-policy';
import { isAutonomousRepairChat } from '~/lib/indobase/builder-prompt-quota.server';
import { streamOpenRouterWithFallback } from '~/lib/indobase/openrouter-stream-fallback';
import type { IProviderSetting } from '~/types/model';
import { PromptLibrary } from '~/lib/common/prompt-library';
import { allowedHTMLElements } from '~/utils/markdown';
import { LLMManager } from '~/lib/modules/llm/manager';
import { createScopedLogger } from '~/utils/logger';
import { createFilesContext, extractPropertiesFromMessage } from './utils';
import { discussPrompt } from '~/lib/common/prompts/discuss-prompt';
import { CODER_AGENT_APPENDIX } from '~/lib/.server/orchestration/prompts';
import { INDOBASE_BRANDING_APPENDIX } from '~/lib/indobase/indobase-branding-prompt';
import { getIndobaseManagedBackendPrompt } from '~/lib/indobase/indobase-backend-prompt';
import { INDOBASE_STUDIO_WORKFLOW_APPENDIX } from '~/lib/indobase/indobase-studio-workflow-prompt';
import { STUDIO_MANAGED_DATABASE_INSTRUCTIONS } from '~/lib/indobase/studio-database-prompt';
import { getGenerationContractAppendix, inferBuilderProjectTarget } from '~/lib/indobase/generation-contract';
import type { DesignScheme } from '~/types/design-scheme';

export type Messages = Message[];

export interface StreamingOptions extends Omit<Parameters<typeof _streamText>[0], 'model'> {
  indobaseConnection?: BackendConnectionContext;
}

type BackendConnectionContext = {
  isConnected: boolean;
  hasSelectedProject: boolean;
  connectionSource?: 'manual' | 'studio_handoff';
  credentials?: {
    anonKey?: string;
    apiUrl?: string;
  };
  indobase?: {
    apiUrl?: string;
    authUrl?: string;
    projectRef?: string;
    restUrl?: string;
    storageUrl?: string;
    studioUrl?: string;
  };
};

function resolveBackendConnection(options?: StreamingOptions) {
  return options?.indobaseConnection;
}

const logger = createScopedLogger('stream-text');

function messageHasImageParts(messages: Array<{ parts?: Message['parts']; content?: Message['content'] }>): boolean {
  return messages.some((message) => {
    if (Array.isArray(message.parts)) {
      return message.parts.some(
        (part) => part.type === 'file' && 'mimeType' in part && String(part.mimeType).startsWith('image/'),
      );
    }

    if (Array.isArray(message.content)) {
      return message.content.some((part) => {
        if (!part || typeof part !== 'object') {
          return false;
        }

        const type = 'type' in part ? String((part as { type?: string }).type) : '';

        return type === 'image' || type === 'file' || type === 'image_url';
      });
    }

    return false;
  });
}

function resolveOpenRouterTask(
  chatMode: 'discuss' | 'build' | undefined,
  messages: Array<{ role: string; content: unknown }>,
): OpenRouterTask {
  if (isAutonomousRepairChat(messages)) {
    return 'debugging';
  }

  if (chatMode === 'discuss') {
    return 'chat';
  }

  return 'codegen';
}

function resolveModelForMessages(
  model: string,
  messages: Array<{ parts?: Message['parts']; content?: Message['content'] }>,
) {
  if (!messageHasImageParts(messages)) {
    return model;
  }

  if (model.includes('-vl') || model.includes('vision')) {
    return model;
  }

  logger.info(`Image attachment detected; switching model from ${model} to ${VISION_MODEL}`);

  return VISION_MODEL;
}

function getCompletionTokenLimit(modelDetails: any): number {
  // 1. If model specifies completion tokens, use that
  if (modelDetails.maxCompletionTokens && modelDetails.maxCompletionTokens > 0) {
    return modelDetails.maxCompletionTokens;
  }

  // 2. Use provider-specific default
  const providerDefault = PROVIDER_COMPLETION_LIMITS[modelDetails.provider];

  if (providerDefault) {
    return providerDefault;
  }

  // 3. Final fallback to MAX_TOKENS, but cap at reasonable limit for safety
  return Math.min(MAX_TOKENS, 16384);
}

/*
 * Catch-all sink for hallucinated tool calls. Models regularly invent tools that do not exist
 * (`list_files`, `read_file`, ...). Without this, the AI SDK throws AI_NoSuchToolError, which
 * kills the whole stream — the build dies silently mid-run. Instead we reroute the bad call here
 * via experimental_repairToolCall; the tool "result" is a corrective message and generation
 * continues, letting the model self-correct within the same run.
 */
const UNAVAILABLE_TOOL_NAME = 'unavailable_tool';

function buildToolGuards(baseTools: Record<string, unknown>) {
  const realToolNames = Object.keys(baseTools);

  const tools = {
    ...baseTools,
    [UNAVAILABLE_TOOL_NAME]: tool({
      description: 'Internal fallback for calls to tools that do not exist. Never call this tool directly.',
      parameters: z.object({}).passthrough(),
      execute: async (args: Record<string, unknown>) => {
        const requested = typeof args.requested_tool === 'string' ? args.requested_tool : 'unknown';

        return (
          `Error: the tool "${requested}" does not exist. ` +
          `The only available tools are: ${realToolNames.join(', ')}. ` +
          'Do NOT call that tool again. Project files are already provided in your context; ' +
          'create or modify files with boltAction file actions in your response, not with tools.'
        );
      },
    }),
  };

  const repairToolCall = async ({ toolCall, error }: { toolCall: any; error: unknown }) => {
    if (NoSuchToolError.isInstance(error)) {
      logger.warn(`Model called unavailable tool "${toolCall.toolName}" — rerouting to ${UNAVAILABLE_TOOL_NAME}`);

      return {
        toolCallType: 'function' as const,
        toolCallId: toolCall.toolCallId,
        toolName: UNAVAILABLE_TOOL_NAME,
        args: JSON.stringify({ requested_tool: toolCall.toolName }),
      };
    }

    if (InvalidToolArgumentsError.isInstance(error)) {
      logger.warn(
        `Model sent invalid arguments to tool "${toolCall.toolName}" — rerouting to ${UNAVAILABLE_TOOL_NAME}`,
      );

      return {
        toolCallType: 'function' as const,
        toolCallId: toolCall.toolCallId,
        toolName: UNAVAILABLE_TOOL_NAME,
        args: JSON.stringify({ requested_tool: toolCall.toolName, problem: 'invalid arguments' }),
      };
    }

    // Anything else: let the original error propagate.
    return null;
  };

  const promptAppendix = `

<tool_calling_rules>
  The ONLY tools that exist are: ${realToolNames.join(', ')}.
  NEVER call any other tool name. Tools like list_files, read_file, write_file, or run_command DO NOT exist.
  Project files are already provided in your context. Create and modify files exclusively with boltAction file actions in your response — never with tool calls.
</tool_calling_rules>`;

  return { tools, repairToolCall, promptAppendix };
}

function sanitizeText(text: string): string {
  let sanitized = text.replace(/<div class=\\"__boltThought__\\">.*?<\/div>/s, '');
  sanitized = sanitized.replace(/<think>.*?<\/think>/s, '');
  sanitized = sanitized.replace(/<boltAction type="file" filePath="package-lock\.json">[\s\S]*?<\/boltAction>/g, '');

  return sanitized.trim();
}

export async function streamText(props: {
  messages: Omit<Message, 'id'>[];
  env?: Env;
  options?: StreamingOptions;
  apiKeys?: Record<string, string>;
  files?: FileMap;
  providerSettings?: Record<string, IProviderSetting>;
  promptId?: string;
  contextOptimization?: boolean;
  contextFiles?: FileMap;
  summary?: string;
  messageSliceId?: number;
  chatMode?: 'discuss' | 'build';
  designScheme?: DesignScheme;
  multiAgentMode?: boolean;
}) {
  const {
    messages,
    env: serverEnv,
    options,
    apiKeys,
    files,
    providerSettings,
    promptId,
    contextOptimization,
    contextFiles,
    summary,
    chatMode,
    designScheme,
    multiAgentMode,
  } = props;
  let currentModel = DEFAULT_MODEL;
  let currentProvider = DEFAULT_PROVIDER.name;
  let processedMessages = messages.map((message) => {
    const newMessage = { ...message };

    if (message.role === 'user') {
      const { model, provider, content } = extractPropertiesFromMessage(message);
      currentModel = model;
      currentProvider = provider;
      newMessage.content = sanitizeText(content);
    } else if (message.role == 'assistant') {
      newMessage.content = sanitizeText(message.content);
    }

    // Sanitize all text parts in parts array, if present
    if (Array.isArray(message.parts)) {
      newMessage.parts = message.parts

        /*
         * Drop tool invocations that never got a result (stream died mid-call, user aborted, ...).
         * convertToCoreMessages throws "ToolInvocation must have a result" on them, which would
         * kill this whole request because of one dangling call in the history.
         */
        .filter((part) => part.type !== 'tool-invocation' || part.toolInvocation?.state === 'result')
        .map((part) => (part.type === 'text' ? { ...part, text: sanitizeText(part.text) } : part));
    }

    return newMessage;
  });

  ({ providerName: currentProvider, modelName: currentModel } = resolveOpenRouterModelForTask(
    resolveOpenRouterTask(chatMode, processedMessages),
    currentProvider,
    currentModel,
  ));

  currentModel = resolveModelForMessages(currentModel, processedMessages);

  const provider = PROVIDER_LIST.find((p) => p.name === currentProvider) || DEFAULT_PROVIDER;
  const staticModels = LLMManager.getInstance().getStaticModelListFromProvider(provider);
  let modelDetails = staticModels.find((m) => m.name === currentModel);

  if (!modelDetails) {
    const modelsList = [
      ...(provider.staticModels || []),
      ...(await LLMManager.getInstance().getModelListFromProvider(provider, {
        apiKeys,
        providerSettings,
        serverEnv: serverEnv as any,
      })),
    ];

    if (!modelsList.length) {
      throw new Error(`No models found for provider ${provider.name}`);
    }

    modelDetails = modelsList.find((m) => m.name === currentModel);

    if (!modelDetails) {
      // Check if it's a Google provider and the model name looks like it might be incorrect
      if (provider.name === 'Google' && currentModel.includes('2.5')) {
        throw new Error(
          `Model "${currentModel}" not found. Gemini 2.5 Pro doesn't exist. Available Gemini models include: gemini-1.5-pro, gemini-2.0-flash, gemini-1.5-flash. Please select a valid model.`,
        );
      }

      // Fallback to first model with warning
      logger.warn(
        `MODEL [${currentModel}] not found in provider [${provider.name}]. Falling back to first model. ${modelsList[0].name}`,
      );
      modelDetails = modelsList[0];
    }
  }

  const dynamicMaxTokens = modelDetails ? getCompletionTokenLimit(modelDetails) : Math.min(MAX_TOKENS, 16384);

  /*
   * OpenRouter free tiers reject very large completion limits. Paid codegen must use its full
   * configured budget (64k): clamping it to 16k truncated one-shot builds mid-file (finishReason
   * "length"), and every continuation regenerated the project until the segment limit was hit,
   * leaving no install/start actions and no preview.
   */
  const safeMaxTokens =
    provider.name === 'OpenRouter'
      ? isOpenRouterPaidCodegenModelId(modelDetails.name)
        ? dynamicMaxTokens
        : Math.min(dynamicMaxTokens, 4096)
      : dynamicMaxTokens;

  logger.info(
    `Token limits for model ${modelDetails.name}: maxTokens=${safeMaxTokens}, maxTokenAllowed=${modelDetails.maxTokenAllowed}, maxCompletionTokens=${modelDetails.maxCompletionTokens}`,
  );

  const backendConnection = resolveBackendConnection(options);

  let systemPrompt =
    PromptLibrary.getPropmtFromLibrary(promptId || 'default', {
      cwd: WORK_DIR,
      allowedHtmlElements: allowedHTMLElements,
      modificationTagName: MODIFICATIONS_TAG_NAME,
      designScheme,
      indobase: {
        isConnected: backendConnection?.isConnected || false,
        hasSelectedProject: backendConnection?.hasSelectedProject || false,
        connectionSource: backendConnection?.connectionSource,
        credentials: backendConnection?.credentials || undefined,
      },
    }) ?? getSystemPrompt();

  if (chatMode === 'build' && contextFiles && contextOptimization) {
    const codeContext = createFilesContext(contextFiles, true);

    systemPrompt = `${systemPrompt}

    Below is the artifact containing the context loaded into context buffer for you to have knowledge of and might need changes to fullfill current user request.
    CONTEXT BUFFER:
    ---
    ${codeContext}
    ---
    `;

    if (summary) {
      systemPrompt = `${systemPrompt}
      below is the chat history till now
      CHAT SUMMARY:
      ---
      ${props.summary}
      ---
      `;

      if (props.messageSliceId) {
        processedMessages = processedMessages.slice(props.messageSliceId);
      } else {
        const lastMessage = processedMessages.pop();

        if (lastMessage) {
          processedMessages = [lastMessage];
        }
      }
    }
  }

  const effectiveLockedFilePaths = new Set<string>();

  if (files) {
    for (const [filePath, fileDetails] of Object.entries(files)) {
      if (fileDetails?.isLocked) {
        effectiveLockedFilePaths.add(filePath);
      }
    }
  }

  if (effectiveLockedFilePaths.size > 0) {
    const lockedFilesListString = Array.from(effectiveLockedFilePaths)
      .map((filePath) => `- ${filePath}`)
      .join('\n');
    systemPrompt = `${systemPrompt}

    IMPORTANT: The following files are locked and MUST NOT be modified in any way. Do not suggest or make any changes to these files. You can proceed with the request but DO NOT make any changes to these files specifically:
    ${lockedFilesListString}
    ---
    `;
  } else {
    console.log('No locked files found from any source for prompt.');
  }

  if (multiAgentMode && chatMode === 'build') {
    systemPrompt = `${systemPrompt}${CODER_AGENT_APPENDIX}`;
  }

  if (chatMode === 'build') {
    systemPrompt = `${systemPrompt}${getGenerationContractAppendix(
      inferBuilderProjectTarget(processedMessages, files),
    )}`;
  }

  systemPrompt = `${systemPrompt}${INDOBASE_BRANDING_APPENDIX}`;

  const isIndobaseManaged =
    backendConnection?.connectionSource === 'studio_handoff' &&
    backendConnection?.isConnected &&
    backendConnection?.hasSelectedProject;

  if (isIndobaseManaged) {
    systemPrompt = systemPrompt.replace(
      /<database_instructions>[\s\S]*?<\/database_instructions>/,
      STUDIO_MANAGED_DATABASE_INSTRUCTIONS,
    );
    systemPrompt = `${systemPrompt}${getIndobaseManagedBackendPrompt({
      projectRef: backendConnection?.indobase?.projectRef,
      apiUrl: backendConnection?.credentials?.apiUrl || backendConnection?.indobase?.apiUrl,
      anonKey: backendConnection?.credentials?.anonKey,
      authUrl: backendConnection?.indobase?.authUrl,
      storageUrl: backendConnection?.indobase?.storageUrl,
      restUrl: backendConnection?.indobase?.restUrl,
    })}${INDOBASE_STUDIO_WORKFLOW_APPENDIX}`;
  }

  logger.info(`Sending llm call to ${provider.name} with model ${modelDetails.name}`);

  // Log reasoning model detection and token parameters
  const isReasoning = isReasoningModel(modelDetails.name);
  logger.info(
    `Model "${modelDetails.name}" is reasoning model: ${isReasoning}, using ${isReasoning ? 'maxCompletionTokens' : 'maxTokens'}: ${safeMaxTokens}`,
  );

  // Validate token limits before API call
  if (safeMaxTokens > (modelDetails.maxTokenAllowed || 128000)) {
    logger.warn(
      `Token limit warning: requesting ${safeMaxTokens} tokens but model supports max ${modelDetails.maxTokenAllowed || 128000}`,
    );
  }

  // Use maxCompletionTokens for reasoning models (o1, GPT-5), maxTokens for traditional models
  const tokenParams = isReasoning ? { maxCompletionTokens: safeMaxTokens } : { maxTokens: safeMaxTokens };

  // Filter out unsupported parameters for reasoning models
  const filteredOptions =
    isReasoning && options
      ? Object.fromEntries(
          Object.entries(options).filter(
            ([key]) =>
              ![
                'temperature',
                'topP',
                'presencePenalty',
                'frequencyPenalty',
                'logprobs',
                'topLogprobs',
                'logitBias',
              ].includes(key),
          ),
        )
      : options || {};

  // DEBUG: Log filtered options
  logger.info(
    `DEBUG STREAM: Options filtering for model "${modelDetails.name}":`,
    JSON.stringify(
      {
        isReasoning,
        originalOptions: options || {},
        filteredOptions,
        originalOptionsKeys: options ? Object.keys(options) : [],
        filteredOptionsKeys: Object.keys(filteredOptions),
        removedParams: options ? Object.keys(options).filter((key) => !(key in filteredOptions)) : [],
      },
      null,
      2,
    ),
  );

  /*
   * When tools are in play, harden against hallucinated tool calls: register a catch-all sink
   * tool, reroute bad calls to it via experimental_repairToolCall, and tell the model exactly
   * which tools exist. Without this a single made-up tool name aborts the entire build stream.
   */
  const baseTools = (filteredOptions as { tools?: Record<string, unknown> }).tools;
  const hasTools = baseTools && Object.keys(baseTools).length > 0;
  const toolGuards = hasTools ? buildToolGuards(baseTools) : undefined;

  if (toolGuards) {
    systemPrompt = `${systemPrompt}${toolGuards.promptAppendix}`;
  }

  const streamParams = {
    model: provider.getModelInstance({
      model: modelDetails.name,
      serverEnv,
      apiKeys,
      providerSettings,
    }),
    system: chatMode === 'build' ? systemPrompt : discussPrompt(),
    ...tokenParams,
    messages: convertToCoreMessages(processedMessages as any),
    ...filteredOptions,
    ...(toolGuards
      ? {
          tools: toolGuards.tools,
          experimental_repairToolCall: toolGuards.repairToolCall,
        }
      : {}),

    // Set temperature to 1 for reasoning models (required by OpenAI API)
    ...(isReasoning ? { temperature: 1 } : {}),
  };

  // DEBUG: Log final streaming parameters
  logger.info(
    `DEBUG STREAM: Final streaming params for model "${modelDetails.name}":`,
    JSON.stringify(
      {
        hasTemperature: 'temperature' in streamParams,
        hasMaxTokens: 'maxTokens' in streamParams,
        hasMaxCompletionTokens: 'maxCompletionTokens' in streamParams,
        paramKeys: Object.keys(streamParams).filter((key) => !['model', 'messages', 'system'].includes(key)),
        streamParams: Object.fromEntries(
          Object.entries(streamParams).filter(([key]) => !['model', 'messages', 'system'].includes(key)),
        ),
      },
      null,
      2,
    ),
  );

  if (provider.name === 'OpenRouter') {
    /*
     * Codegen (every build) runs on the paid model. It previously had NO fallback, so a single
     * unavailability — no credits, rate limit, provider blip, deprecated id — failed the whole
     * build instead of degrading. Keep the paid model first, then fall back to free coding models
     * so a build still completes (lower quality) rather than producing nothing.
     */
    const fallbackModels = [
      modelDetails.name,
      ...OPENROUTER_FREE_CODING_MODELS.map((model) => model.name).filter((name) => name !== modelDetails.name),
    ];

    return streamOpenRouterWithFallback({
      fallbackModels,
      buildStreamParams: (modelName) => {
        /*
         * Re-clamp the output budget per model. The paid codegen model allows far more than the
         * free fallbacks (e.g. 64k vs 32k), and sending the paid ceiling to a smaller model is a
         * 400 — which is retryable, so it would cascade through every fallback and fail the build.
         */
        const fallbackDetails =
          OPENROUTER_FREE_CODING_MODELS.find((model) => model.name === modelName) ??
          (modelName === modelDetails.name ? modelDetails : undefined);
        const fallbackLimit = fallbackDetails
          ? getCompletionTokenLimit({ ...fallbackDetails, provider: provider.name })
          : safeMaxTokens;
        const clamped = Math.min(safeMaxTokens, fallbackLimit);

        return {
          ...streamParams,
          ...(isReasoning ? { maxCompletionTokens: clamped } : { maxTokens: clamped }),
          model: provider.getModelInstance({
            model: modelName,
            serverEnv,
            apiKeys,
            providerSettings,
          }),
        };
      },
    });
  }

  return await _streamText(streamParams);
}
