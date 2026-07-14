import { type ActionFunctionArgs } from '@remix-run/cloudflare';
import { createDataStream, generateId } from 'ai';
import { MAX_RESPONSE_SEGMENTS, MAX_TOKENS, type FileMap } from '~/lib/.server/llm/constants';
import { CONTINUE_PROMPT } from '~/lib/common/prompts/prompts';
import { streamText, type Messages, type StreamingOptions } from '~/lib/.server/llm/stream-text';
import { describeRateLimit } from '~/lib/indobase/openrouter-stream-fallback';
import SwitchableStream from '~/lib/.server/llm/switchable-stream';
import type { IProviderSetting } from '~/types/model';
import { createScopedLogger } from '~/utils/logger';
import { getFilePaths, selectContext } from '~/lib/.server/llm/select-context';
import type { ContextAnnotation, ProgressAnnotation } from '~/types/context';
import { WORK_DIR } from '~/utils/constants';
import { createSummary } from '~/lib/.server/llm/create-summary';
import { extractPropertiesFromMessage } from '~/lib/.server/llm/utils';
import type { DesignScheme } from '~/types/design-scheme';
import { MCPService } from '~/lib/services/mcpService';
import { StreamRecoveryManager } from '~/lib/.server/llm/stream-recovery';
import { withSecurity } from '~/lib/security';
import { completeCoderPhase, runPlannerPhase } from '~/lib/.server/orchestration/orchestrate-chat';
import {
  buildStudioBillingUrl,
  consumeBuilderPromptFromStudio,
  resolveBuilderMcpClaims,
  shouldConsumeBuilderPrompt,
} from '~/lib/indobase/builder-prompt-quota.server';
import { isAutonomousRepairChat } from '~/lib/indobase/builder-prompt-quota.server';
import { isTemplateBootstrapFollowUp } from '~/lib/indobase/chat-request';
import { ensureIndobaseMcpFromRequest } from '~/lib/indobase/ensure-mcp.server';

const logger = createScopedLogger('api.chat');

function parseCookies(cookieHeader: string): Record<string, string> {
  const cookies: Record<string, string> = {};

  const items = cookieHeader.split(';').map((cookie) => cookie.trim());

  items.forEach((item) => {
    const [name, ...rest] = item.split('=');

    if (name && rest) {
      const decodedName = decodeURIComponent(name.trim());
      const decodedValue = decodeURIComponent(rest.join('=').trim());
      cookies[decodedName] = decodedValue;
    }
  });

  return cookies;
}

async function chatAction({ context, request }: ActionFunctionArgs) {
  type BackendConnectionPayload = {
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

  const streamRecovery = new StreamRecoveryManager({
    timeout: 180_000,
    maxRetries: 5,
    onTimeout: () => {
      logger.warn('Stream timeout - attempting recovery');
    },
  });

  /** Keep proxies/load balancers from closing idle SSE while the model/tools work. */
  const STREAM_KEEPALIVE_MS = 20_000;

  const body = await request.json<{
      messages: Messages;
      files: any;
      promptId?: string;
      contextOptimization: boolean;
      chatMode: 'discuss' | 'build';
      designScheme?: DesignScheme;
      multiAgentMode?: boolean;
      indobase?: BackendConnectionPayload;
      maxLLMSteps: number;
    }>();

  const {
    messages,
    files,
    promptId,
    contextOptimization,
    chatMode,
    designScheme,
    maxLLMSteps,
    multiAgentMode,
  } = body;
  const indobaseBackend = body.indobase;

  const cookieHeader = request.headers.get('Cookie');
  const apiKeys = JSON.parse(parseCookies(cookieHeader || '').apiKeys || '{}');
  const providerSettings: Record<string, IProviderSetting> = JSON.parse(
    parseCookies(cookieHeader || '').providers || '{}',
  );

  const env = (context as { cloudflare?: { env?: Record<string, string | undefined> } })?.cloudflare?.env;

  if (shouldConsumeBuilderPrompt(chatMode, messages)) {
    const quotaResult = await consumeBuilderPromptFromStudio(request, env);

    if (!quotaResult.ok) {
      if ('unauthorized' in quotaResult && quotaResult.unauthorized) {
        return new Response(JSON.stringify({ error: true, message: 'Unauthorized', statusCode: 401 }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      const claims = await resolveBuilderMcpClaims(request, env);
      const upgradePath = quotaResult.upgradeUrl;
      const upgradeUrl =
        claims && upgradePath ? buildStudioBillingUrl(claims.studio_url, upgradePath) : upgradePath;

      return new Response(
        JSON.stringify({
          error: true,
          message: 'Free Builder limit reached (5 prompts). Upgrade to Pro for unlimited build and discuss messages with agent orchestration.',
          statusCode: 402,
          errorType: 'quota',
          used: quotaResult.quota.used,
          limit: quotaResult.quota.limit,
          remaining: quotaResult.quota.remaining,
          upgradeUrl,
        }),
        {
          status: 402,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }
  }

  const stream = new SwitchableStream();

  const cumulativeUsage = {
    completionTokens: 0,
    promptTokens: 0,
    totalTokens: 0,
  };
  const encoder: TextEncoder = new TextEncoder();
  let progressCounter: number = 1;

  try {
    const mcpService = MCPService.getInstance();
    await ensureIndobaseMcpFromRequest(request, mcpService, env);
    const totalMessageContent = messages.reduce((acc, message) => acc + message.content, '');
    logger.debug(`Total message length: ${totalMessageContent.split(' ').length}, words`);

    let lastChunk: string | undefined = undefined;
    let keepaliveTimer: ReturnType<typeof setInterval> | null = null;

    const dataStream = createDataStream({
      async execute(dataStream) {
        streamRecovery.startMonitoring();

        const filePaths = getFilePaths(files || {});
        let filteredFiles: FileMap | undefined = undefined;
        let summary: string | undefined = undefined;
        let messageSliceId = 0;

        const processedMessages = await mcpService.processToolInvocations(messages, dataStream);
        streamRecovery.updateActivity();
        const templateBootstrap = isTemplateBootstrapFollowUp(processedMessages);
        const isRepairRound = isAutonomousRepairChat(processedMessages);
        // Keep multi-agent + MCP enabled on template follow-up — that turn wires the Indobase backend.
        const useMultiAgent = chatMode === 'build' && !isRepairRound;
        let orchestratedMessages = processedMessages;
        const progressOrder = { value: progressCounter };

        if (useMultiAgent) {
          const plannerResult = await runPlannerPhase({
            messages: processedMessages,
            dataStream,
            progressOrder,
            env: context.cloudflare?.env,
            apiKeys,
            providerSettings,
            onUsage(usage) {
              cumulativeUsage.completionTokens += usage.completionTokens || 0;
              cumulativeUsage.promptTokens += usage.promptTokens || 0;
              cumulativeUsage.totalTokens += usage.totalTokens || 0;
            },
          });
          orchestratedMessages = plannerResult.messages;
          progressCounter = progressOrder.value;
          streamRecovery.updateActivity();
        }

        if (processedMessages.length > 3) {
          messageSliceId = processedMessages.length - 3;
        }

        if (filePaths.length > 0 && contextOptimization && !templateBootstrap) {
          logger.debug('Generating Chat Summary');
          dataStream.writeData({
            type: 'progress',
            label: 'summary',
            status: 'in-progress',
            order: progressCounter++,
            message: 'Analysing Request',
          } satisfies ProgressAnnotation);

          // Create a summary of the chat
          console.log(`Messages count: ${processedMessages.length}`);

          summary = await createSummary({
            messages: [...processedMessages],
            env: context.cloudflare?.env,
            apiKeys,
            providerSettings,
            promptId,
            contextOptimization,
            onFinish(resp) {
              if (resp.usage) {
                logger.debug('createSummary token usage', JSON.stringify(resp.usage));
                cumulativeUsage.completionTokens += resp.usage.completionTokens || 0;
                cumulativeUsage.promptTokens += resp.usage.promptTokens || 0;
                cumulativeUsage.totalTokens += resp.usage.totalTokens || 0;
              }
            },
          });
          streamRecovery.updateActivity();
          dataStream.writeData({
            type: 'progress',
            label: 'summary',
            status: 'complete',
            order: progressCounter++,
            message: 'Analysis Complete',
          } satisfies ProgressAnnotation);

          dataStream.writeMessageAnnotation({
            type: 'chatSummary',
            summary,
            chatId: processedMessages.slice(-1)?.[0]?.id,
          } as ContextAnnotation);

          // Update context buffer
          logger.debug('Updating Context Buffer');
          dataStream.writeData({
            type: 'progress',
            label: 'context',
            status: 'in-progress',
            order: progressCounter++,
            message: 'Determining Files to Read',
          } satisfies ProgressAnnotation);

          // Select context files
          console.log(`Messages count: ${processedMessages.length}`);
          filteredFiles = await selectContext({
            messages: [...processedMessages],
            env: context.cloudflare?.env,
            apiKeys,
            files,
            providerSettings,
            promptId,
            contextOptimization,
            summary,
            onFinish(resp) {
              if (resp.usage) {
                logger.debug('selectContext token usage', JSON.stringify(resp.usage));
                cumulativeUsage.completionTokens += resp.usage.completionTokens || 0;
                cumulativeUsage.promptTokens += resp.usage.promptTokens || 0;
                cumulativeUsage.totalTokens += resp.usage.totalTokens || 0;
              }
            },
          });
          streamRecovery.updateActivity();

          if (filteredFiles) {
            logger.debug(`files in context : ${JSON.stringify(Object.keys(filteredFiles))}`);
          }

          dataStream.writeMessageAnnotation({
            type: 'codeContext',
            files: Object.keys(filteredFiles).map((key) => {
              let path = key;

              if (path.startsWith(WORK_DIR)) {
                path = path.replace(WORK_DIR, '');
              }

              return path;
            }),
          } as ContextAnnotation);

          dataStream.writeData({
            type: 'progress',
            label: 'context',
            status: 'complete',
            order: progressCounter++,
            message: 'Code Files Selected',
          } satisfies ProgressAnnotation);

          // logger.debug('Code Files Selected');
        }

        const mcpTools = mcpService.toolsWithoutExecute;
        const hasMcpTools = Object.keys(mcpTools).length > 0;

        const options: StreamingOptions = {
          indobaseConnection: indobaseBackend
            ? {
                ...indobaseBackend,
                connectionSource: indobaseBackend.connectionSource,
                indobase: indobaseBackend.indobase,
              }
            : undefined,
          toolChoice: hasMcpTools ? 'auto' : undefined,
          tools: hasMcpTools ? mcpTools : undefined,
          maxSteps: maxLLMSteps,
          onStepFinish: ({ toolCalls }) => {
            // add tool call annotations for frontend processing
            toolCalls.forEach((toolCall) => {
              mcpService.processToolCall(toolCall, dataStream);
            });
          },
          onFinish: async ({ text: content, finishReason, usage }) => {
            logger.debug('usage', JSON.stringify(usage));

            if (usage) {
              cumulativeUsage.completionTokens += usage.completionTokens || 0;
              cumulativeUsage.promptTokens += usage.promptTokens || 0;
              cumulativeUsage.totalTokens += usage.totalTokens || 0;
            }

            if (finishReason !== 'length') {
              if (useMultiAgent) {
                completeCoderPhase(dataStream, progressOrder);
                progressCounter = progressOrder.value;
              }

              dataStream.writeMessageAnnotation({
                type: 'usage',
                value: {
                  completionTokens: cumulativeUsage.completionTokens,
                  promptTokens: cumulativeUsage.promptTokens,
                  totalTokens: cumulativeUsage.totalTokens,
                },
              });
              dataStream.writeData({
                type: 'progress',
                label: 'response',
                status: 'complete',
                order: progressCounter++,
                message: 'Response Generated',
              } satisfies ProgressAnnotation);
              await new Promise((resolve) => setTimeout(resolve, 0));

              // stream.close();
              return;
            }

            if (stream.switches >= MAX_RESPONSE_SEGMENTS) {
              throw Error('Cannot continue message: Maximum segments reached');
            }

            const switchesLeft = MAX_RESPONSE_SEGMENTS - stream.switches;

            logger.info(`Reached max token limit (${MAX_TOKENS}): Continuing message (${switchesLeft} switches left)`);

            const lastUserMessage = orchestratedMessages.filter((x) => x.role == 'user').slice(-1)[0];
            const { model, provider } = extractPropertiesFromMessage(lastUserMessage);
            orchestratedMessages.push({ id: generateId(), role: 'assistant', content });
            orchestratedMessages.push({
              id: generateId(),
              role: 'user',
              content: `[Model: ${model}]\n\n[Provider: ${provider}]\n\n${CONTINUE_PROMPT}`,
            });

            const result = await streamText({
              messages: [...orchestratedMessages],
              env: context.cloudflare?.env,
              options,
              apiKeys,
              files,
              providerSettings,
              promptId,
              contextOptimization,
              contextFiles: filteredFiles,
              chatMode,
              designScheme,
              summary,
              messageSliceId,
              multiAgentMode: useMultiAgent,
            });

            result.mergeIntoDataStream(dataStream);

            (async () => {
              for await (const part of result.fullStream) {
                if (part.type === 'error') {
                  const error: any = part.error;
                  logger.error(`${error}`);

                  return;
                }
              }
            })();

            return;
          },
        };

        dataStream.writeData({
          type: 'progress',
          label: 'response',
          status: 'in-progress',
          order: progressCounter++,
          message: 'Generating Response',
        } satisfies ProgressAnnotation);

        const result = await streamText({
          messages: [...orchestratedMessages],
          env: context.cloudflare?.env,
          options,
          apiKeys,
          files,
          providerSettings,
          promptId,
          contextOptimization,
          contextFiles: filteredFiles,
          chatMode,
          designScheme,
          summary,
          messageSliceId,
          multiAgentMode: useMultiAgent,
        });

        (async () => {
          for await (const part of result.fullStream) {
            streamRecovery.updateActivity();

            if (part.type === 'error') {
              const error: any = part.error;
              logger.error('Streaming error:', error);
              streamRecovery.stop();

              // Enhanced error handling for common streaming issues
              if (error.message?.includes('Invalid JSON response')) {
                logger.error('Invalid JSON response detected - likely malformed API response');
              } else if (error.message?.includes('token')) {
                logger.error('Token-related error detected - possible token limit exceeded');
              }

              return;
            }
          }
          streamRecovery.stop();
        })();
        result.mergeIntoDataStream(dataStream);
      },
      onError: (error: any) => {
        // Rate limits: show the concrete wait time instead of a long generic
        // message, so users know exactly when they can retry.
        const rateLimitMessage = describeRateLimit(error);

        if (rateLimitMessage) {
          return `Custom error: ${rateLimitMessage}`;
        }

        // Provide more specific error messages for common issues
        const errorMessage = error.message || 'Unknown error';

        if (errorMessage.includes('model') && errorMessage.includes('not found')) {
          return 'Custom error: Invalid model selected. Please check that the model name is correct and available.';
        }

        if (errorMessage.includes('Invalid JSON response')) {
          return 'Custom error: The AI service returned an invalid response. This may be due to an invalid model name, API rate limiting, or server issues. Try selecting a different model or check your API key.';
        }

        if (
          errorMessage.includes('API key') ||
          errorMessage.includes('unauthorized') ||
          errorMessage.includes('authentication')
        ) {
          return 'Custom error: Invalid or missing API key. Please check your API key configuration.';
        }

        if (errorMessage.includes('token') && errorMessage.includes('limit')) {
          return 'Custom error: Token limit exceeded. The conversation is too long for the selected model. Try using a model with larger context window or start a new conversation.';
        }

        if (errorMessage.includes('rate limit') || errorMessage.includes('429') || errorMessage.includes('Too Many Requests')) {
          return 'Custom error: API rate limit exceeded. Please wait a moment before trying again.';
        }

        if (errorMessage.includes('network') || errorMessage.includes('timeout') || errorMessage.includes('ECONNRESET')) {
          return 'Custom error: The builder stream was interrupted. This is often a temporary proxy timeout — please retry. If it keeps happening, refresh the page.';
        }

        return `Custom error: ${errorMessage}`;
      },
    }).pipeThrough(
      new TransformStream({
        start(controller) {
          const ping = () => {
            try {
              controller.enqueue(
                encoder.encode(`2:${JSON.stringify([{ type: 'keepalive', ts: Date.now() }])}\n`),
              );
            } catch {
              if (keepaliveTimer) {
                clearInterval(keepaliveTimer);
                keepaliveTimer = null;
              }
            }
          };

          // Immediate ping so intermediaries see activity before the first model token.
          ping();
          keepaliveTimer = setInterval(ping, STREAM_KEEPALIVE_MS);
        },
        transform: (chunk, controller) => {
          if (!lastChunk) {
            lastChunk = ' ';
          }

          if (typeof chunk === 'string') {
            if (chunk.startsWith('g') && !lastChunk.startsWith('g')) {
              controller.enqueue(encoder.encode(`0: "<div class=\\"__boltThought__\\">"\n`));
            }

            if (lastChunk.startsWith('g') && !chunk.startsWith('g')) {
              controller.enqueue(encoder.encode(`0: "</div>\\n"\n`));
            }
          }

          lastChunk = chunk;

          let transformedChunk = chunk;

          if (typeof chunk === 'string' && chunk.startsWith('g')) {
            let content = chunk.split(':').slice(1).join(':');

            if (content.endsWith('\n')) {
              content = content.slice(0, content.length - 1);
            }

            transformedChunk = `0:${content}\n`;
          }

          // Convert the string stream to a byte stream
          const str = typeof transformedChunk === 'string' ? transformedChunk : JSON.stringify(transformedChunk);
          controller.enqueue(encoder.encode(str));
        },
        flush() {
          if (keepaliveTimer) {
            clearInterval(keepaliveTimer);
            keepaliveTimer = null;
          }
        },
      }),
    );

    return new Response(dataStream, {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        Connection: 'keep-alive',
        'Cache-Control': 'no-cache, no-transform',
        'Text-Encoding': 'chunked',
        'X-Accel-Buffering': 'no',
      },
    });
  } catch (error: any) {
    logger.error(error);

    const errorResponse = {
      error: true,
      message: error.message || 'An unexpected error occurred',
      statusCode: error.statusCode || 500,
      isRetryable: error.isRetryable !== false, // Default to retryable unless explicitly false
      provider: error.provider || 'unknown',
    };

    if (error.message?.includes('API key')) {
      return new Response(
        JSON.stringify({
          ...errorResponse,
          message: 'Invalid or missing API key',
          statusCode: 401,
          isRetryable: false,
        }),
        {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
          statusText: 'Unauthorized',
        },
      );
    }

    if (/image input|image_url|multimodal|vision/i.test(error.message || '')) {
      return new Response(
        JSON.stringify({
          ...errorResponse,
          message:
            'The selected model cannot read screenshots. Remove the image and try again, or wait for the vision model update to deploy.',
          statusCode: 400,
          isRetryable: false,
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
          statusText: 'Bad Request',
        },
      );
    }

    return new Response(JSON.stringify(errorResponse), {
      status: errorResponse.statusCode,
      headers: { 'Content-Type': 'application/json' },
      statusText: 'Error',
    });
  }
}

export const action = withSecurity(chatAction, { requireAuth: true });
