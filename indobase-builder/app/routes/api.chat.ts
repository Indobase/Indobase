import { type ActionFunctionArgs } from '@remix-run/cloudflare';
import { createDataStream, generateId } from 'ai';
import { MAX_RESPONSE_SEGMENTS, type FileMap } from '~/lib/.server/llm/constants';
import { CONTINUE_PROMPT } from '~/lib/common/prompts/prompts';
import { streamText, type Messages, type StreamingOptions } from '~/lib/.server/llm/stream-text';
import { isIncompleteBoltArtifact } from '~/lib/.server/llm/incomplete-artifact';
import { describeRateLimit } from '~/lib/indobase/openrouter-stream-fallback';
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
import {
  completeCoderPhase,
  injectPlannerPlan,
} from '~/lib/.server/orchestration/orchestrate-chat';
import {
  buildStudioBillingUrl,
  consumeBuilderPromptFromStudio,
  resolveBuilderMcpClaims,
  shouldConsumeBuilderPrompt,
} from '~/lib/indobase/builder-prompt-quota.server';
import { isAutonomousRepairChat } from '~/lib/indobase/builder-prompt-quota.server';
import { isTemplateBootstrapFollowUp } from '~/lib/indobase/chat-request';
import { ensureIndobaseMcpFromRequest } from '~/lib/indobase/ensure-mcp.server';
import { inspectOneShotBuildResponse, isInitialScaffoldTurn, getInstantBuildPlan } from '~/lib/indobase/generation-contract';

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

  const cumulativeUsage = {
    completionTokens: 0,
    promptTokens: 0,
    totalTokens: 0,
  };
  const encoder: TextEncoder = new TextEncoder();
  let progressCounter: number = 1;

  try {
    const mcpService = MCPService.getInstance();

    /*
     * Payments / Studio MCP registration must never take down chat. A failing payments
     * endpoint previously could reject ensure() and surface as a hard chat error before
     * the model even started.
     */
    try {
      await ensureIndobaseMcpFromRequest(request, mcpService, env);
    } catch (error) {
      logger.warn('Indobase MCP ensure failed; continuing without MCP tools', error);
    }

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

        /*
         * MCP tool execution must not be able to kill the run either: an unguarded throw here
         * rejects execute() and the browser only sees net::ERR_ABORTED. Fall back to the raw
         * messages so the build continues without the tool results.
         */
        let processedMessages = messages;

        try {
          processedMessages = await mcpService.processToolInvocations(messages, dataStream);
        } catch (error) {
          logger.warn('MCP tool invocation processing failed; continuing without tool results', error);
        }

        streamRecovery.updateActivity();
        const templateBootstrap = isTemplateBootstrapFollowUp(processedMessages);
        const isRepairRound = isAutonomousRepairChat(processedMessages);
        // Keep multi-agent + MCP enabled on template follow-up — that turn wires the Indobase backend.
        const useMultiAgent = chatMode === 'build' && !isRepairRound;
        let orchestratedMessages = processedMessages;
        const progressOrder = { value: progressCounter };

        /*
         * Tool-continuation round: the last message is the assistant's own turn, resumed after an
         * MCP tool call was approved and executed. Re-running scoping/planner/summary/context here
         * generated a brand-new plan for EVERY tool call — each call cost a full planner round
         * (~80s + tokens), so a build making a handful of MCP calls spent 10+ minutes replanning
         * instead of writing code. Skip straight to the coder with the tool result.
         */
        const isToolContinuationRound = processedMessages[processedMessages.length - 1]?.role === 'assistant';

        /*
         * Count tool calls in the current assistant turn (since the last real user message). Used
         * to cut the model off from further tool calls when it loops instead of building.
         */
        let toolInvocationsThisTurn = 0;

        for (let i = processedMessages.length - 1; i >= 0; i--) {
          const message = processedMessages[i];

          if (message.role === 'user') {
            break;
          }

          if (message.role === 'assistant' && Array.isArray(message.parts)) {
            toolInvocationsThisTurn += message.parts.filter((part) => part.type === 'tool-invocation').length;
          }
        }

        const MAX_TOOL_CALLS_PER_TURN = 10;
        const toolBudgetExhausted = toolInvocationsThisTurn >= MAX_TOOL_CALLS_PER_TURN;

        /*
         * Initial scaffold = no prior assistant bolt file artifact yet. Clarifying-question turns
         * still count as pre-scaffold, so we keep MCP off and enforce install+start one-shot.
         */
        const isFirstBuildTurn = isInitialScaffoldTurn(processedMessages);

        /*
         * Emergent-fast path: never wait on an LLM planner round. Inject a local instant plan
         * (domain-aware for auth/payments/DB) and go straight to codegen.
         */
        if (useMultiAgent && !isToolContinuationRound) {
          const instantPlan = getInstantBuildPlan(processedMessages);
          orchestratedMessages = injectPlannerPlan(processedMessages, instantPlan);
          logger.info('Using instant build plan (LLM planner skipped)');
          dataStream.writeData({
            type: 'progress',
            label: 'coder',
            status: 'in-progress',
            order: progressCounter++,
            message: 'Building',
          } satisfies ProgressAnnotation);
          dataStream.writeMessageAnnotation({
            type: 'agentPlan',
            agent: 'planner',
            plan: instantPlan,
            steps: instantPlan
              .split('\n')
              .map((line) => line.replace(/^\d+[.)]\s+/, '').trim())
              .filter((line) => line && !line.startsWith('#')),
          });
          streamRecovery.updateActivity();
        }

        if (processedMessages.length > 3) {
          messageSliceId = processedMessages.length - 3;
        }

        // Continuation and focused repair rounds already carry the exact context they need.
        // Summary + context selection are two avoidable model calls on the latency-critical path.
        if (
          filePaths.length > 0 &&
          contextOptimization &&
          !templateBootstrap &&
          !isToolContinuationRound &&
          !isRepairRound
        ) {
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

          /*
           * Context optimisation is an OPTIMISATION, not a requirement. It was unguarded, so a
           * throw here rejected the whole execute(), closed the data stream, and surfaced to the
           * browser as a bare net::ERR_ABORTED with no error — the build simply died mid-run.
           * Degrade to "no summary" and keep building, exactly as the planner phase already does.
           */
          try {
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
          } catch (error) {
            logger.warn('createSummary failed; continuing without a chat summary', error);
            summary = undefined;
          }

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
          // Same rule as the summary above: a context-selection failure must not kill the build.
          try {
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
          } catch (error) {
            // Undefined => the coder sees the full file set instead of a curated subset.
            logger.warn('selectContext failed; continuing with unfiltered files', error);
            filteredFiles = undefined;
          }

          streamRecovery.updateActivity();

          if (filteredFiles) {
            logger.debug(`files in context : ${JSON.stringify(Object.keys(filteredFiles))}`);
          }

          dataStream.writeMessageAnnotation({
            type: 'codeContext',
            // filteredFiles is undefined when selection failed — do not deref it.
            files: Object.keys(filteredFiles ?? {}).map((key) => {
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

        /*
         * First build turns must write files, not poke the live database. With MCP tools enabled the
         * coder burns rounds on list_files / apply_migration before scaffolding, then marks shell
         * actions complete without a working preview. Tools stay available on follow-up turns.
         */
        const hasMcpTools =
          Object.keys(mcpTools).length > 0 && !toolBudgetExhausted && !isFirstBuildTurn && !isRepairRound;

        if (toolBudgetExhausted) {
          logger.warn(
            `Tool budget exhausted for this turn (${toolInvocationsThisTurn} tool calls); disabling tools to force codegen`,
          );
        } else if (isFirstBuildTurn && Object.keys(mcpTools).length > 0) {
          logger.info('First build turn: MCP tools disabled so the coder scaffolds files first');
        }

        let continueCount = 0;
        let coderResponseContent = '';

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
            coderResponseContent += content ?? '';

            const oneShotInspection = isFirstBuildTurn
              ? inspectOneShotBuildResponse(coderResponseContent)
              : { complete: true, issues: [] };
            logger.info(
              `Coder stream finished: reason=${finishReason}, chars=${content?.length ?? 0}, incompleteArtifact=${isIncompleteBoltArtifact(coderResponseContent)}, oneShotComplete=${oneShotInspection.complete}`,
            );
            logger.debug('usage', JSON.stringify(usage));

            if (usage) {
              cumulativeUsage.completionTokens += usage.completionTokens || 0;
              cumulativeUsage.promptTokens += usage.promptTokens || 0;
              cumulativeUsage.totalTokens += usage.totalTokens || 0;
            }

            /*
             * Providers (esp. via OpenRouter) often report finishReason "stop" when they hit a soft
             * output ceiling mid-tag. Without treating unclosed boltArtifact/boltAction as truncation,
             * we leave half-written Navbar.jsx files and never continue — the build just stops.
             */
            const needsContinue =
              finishReason === 'length' ||
              isIncompleteBoltArtifact(coderResponseContent) ||
              !oneShotInspection.complete;

            if (!needsContinue) {
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

            if (continueCount >= MAX_RESPONSE_SEGMENTS) {
              logger.warn(
                `Max response segments (${MAX_RESPONSE_SEGMENTS}) reached with incomplete artifact; finishing with partial output`,
              );

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
                message: 'Response Generated (partial — hit segment limit)',
              } satisfies ProgressAnnotation);
              return;
            }

            continueCount += 1;
            const switchesLeft = MAX_RESPONSE_SEGMENTS - continueCount;

            logger.info(
              `Continuing coder output (${continueCount}/${MAX_RESPONSE_SEGMENTS}, reason=${finishReason}, issues=${oneShotInspection.issues.join(', ') || 'truncated artifact'}, ${switchesLeft} segments left)`,
            );

            const lastUserMessage = orchestratedMessages.filter((x) => x.role == 'user').slice(-1)[0];
            const { model, provider } = extractPropertiesFromMessage(lastUserMessage);
            orchestratedMessages.push({ id: generateId(), role: 'assistant', content });
            orchestratedMessages.push({
              id: generateId(),
              role: 'user',
              content: `[Model: ${model}]\n\n[Provider: ${provider}]\n\n${
                oneShotInspection.complete
                  ? CONTINUE_PROMPT
                  : `${CONTINUE_PROMPT}
The initial build response is incomplete: ${oneShotInspection.issues.join(', ')}. Emit only what is missing — execution actions belong in a bolt artifact; recommendations belong in one <bolt-quick-actions> group with type="message" entries after the artifact. Do not repeat files or actions that are already complete.`
              }`,
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
              // Keepalives prove the SSE pipe is alive during long planner/model gaps;
              // also reset stream-recovery so idle LLM work is not logged as timeouts.
              streamRecovery.updateActivity();
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
