import type { Message } from 'ai';
import { useCallback, useState } from 'react';
import { EnhancedStreamingMessageParser } from '~/lib/runtime/enhanced-message-parser';
import { workbenchStore } from '~/lib/stores/workbench';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('useMessageParser');

const messageParser = new EnhancedStreamingMessageParser({
  callbacks: {
    onArtifactOpen: (data) => {
      logger.trace('onArtifactOpen', data);

      workbenchStore.showWorkbench.set(true);
      workbenchStore.addArtifact(data);
    },
    onArtifactClose: (data) => {
      logger.trace('onArtifactClose');

      workbenchStore.updateArtifact(data, { closed: true });
    },
    onActionOpen: (data) => {
      logger.trace('onActionOpen', data.action);

      /*
       * File actions are streamed, so we add them immediately to show progress
       * Shell actions are complete when created by enhanced parser, so we wait for close
       */
      if (data.action.type === 'file') {
        workbenchStore.addAction(data);
      }
    },
    onActionClose: (data) => {
      logger.trace('onActionClose', data.action);

      /*
       * Add non-file actions (shell, build, start, etc.) when they close
       * Enhanced parser creates complete shell actions, so they're ready to execute
       */
      if (data.action.type !== 'file') {
        workbenchStore.addAction(data);
      }

      workbenchStore.runAction(data);
    },
    onActionStream: (data) => {
      logger.trace('onActionStream', data.action);
      workbenchStore.runAction(data, true);
    },
  },
});
const extractTextContent = (message: Message) =>
  Array.isArray(message.content)
    ? (message.content.find((item) => item.type === 'text')?.text as string) || ''
    : message.content;

export function parseAssistantMessage(message: Message) {
  if (message.role !== 'assistant' && message.role !== 'user') {
    return '';
  }

  return messageParser.parse(message.id, extractTextContent(message));
}

export function useMessageParser() {
  const [parsedMessages, setParsedMessages] = useState<{ [key: number]: string }>({});

  const parseMessages = useCallback((messages: Message[], isLoading: boolean) => {
    let reset = false;

    if (import.meta.env.DEV && !isLoading) {
      reset = true;
      messageParser.reset();
    }

    /*
     * While streaming, only the last assistant message grows. Re-walking the entire transcript
     * and calling setState per message was a main-thread killer on multi-file CRM builds.
     */
    const indices = isLoading && messages.length > 0 ? [messages.length - 1] : [...messages.keys()];
    const chunks: { [key: number]: string } = {};
    let hasChunk = false;

    for (const index of indices) {
      const message = messages[index];

      if (!message || (message.role !== 'assistant' && message.role !== 'user')) {
        continue;
      }

      try {
        const newParsedContent = messageParser.parse(message.id, extractTextContent(message));

        if (newParsedContent || reset) {
          chunks[index] = newParsedContent;
          hasChunk = true;
        }
      } catch (error) {
        logger.error('Failed to parse assistant message', error);
        chunks[index] =
          '\n\n_Indobase Builder could not render part of this response. Start a new chat or retry your prompt._\n';
        hasChunk = true;
      }
    }

    if (!hasChunk) {
      return;
    }

    setParsedMessages((prevParsed) => {
      const next = { ...prevParsed };

      for (const [indexKey, chunk] of Object.entries(chunks)) {
        const index = Number(indexKey);
        next[index] = !reset ? (prevParsed[index] || '') + chunk : chunk;
      }

      return next;
    });
  }, []);

  return { parsedMessages, parseMessages };
}
