import { AnimatePresence, motion } from 'framer-motion';
import type { IndobaseBackendAlert } from '~/types/actions';
import { classNames } from '~/utils/classNames';
import { indobaseConnection } from '~/lib/stores/indobase-connection';
import { useStore } from '@nanostores/react';
import { useEffect, useRef, useState } from 'react';
import { hasIndobaseStudioHandoff } from '~/lib/indobase/connection';
import { ensureBuilderSession } from '~/lib/indobase/builder-auth.client';
import { executeIndobaseSql } from '~/lib/indobase/studioSql';
import { OPEN_INDOBASE_CONNECTION_EVENT } from '~/lib/indobase/connection-storage';

interface Props {
  alert: IndobaseBackendAlert;
  clearAlert: () => void;
  postMessage: (message: string) => void;
}

export function IndobaseBackendChatAlert({ alert, clearAlert, postMessage }: Props) {
  const { content, title } = alert;
  const connection = useStore(indobaseConnection);
  const [isExecuting, setIsExecuting] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(true);
  const autoAppliedRef = useRef(false);

  const isStudioManaged = hasIndobaseStudioHandoff(connection);
  const isConnected = isStudioManaged;

  const description = isConnected ? 'Apply to your Indobase project database' : 'Backend connection required';
  const message = isConnected
    ? 'This session is linked to Indobase Studio. Database changes run on your tenant data plane automatically.'
    : 'Open Builder from Studio to connect your Indobase project automatically.';

  const handleConnectClick = () => {
    document.dispatchEvent(new CustomEvent(OPEN_INDOBASE_CONNECTION_EVENT));
  };

  const executeBackendAction = async (sql: string) => {
    setIsExecuting(true);

    try {
      if (!isStudioManaged) {
        throw new Error('Indobase Studio session required');
      }

      await ensureBuilderSession();
      const isMigration = /migration/i.test(title);
      const migrationName = alert.description?.match(/:\s*(.+)$/)?.[1]?.trim();

      await executeIndobaseSql({
        connection,
        query: sql,
        operation: isMigration ? 'migration' : 'query',
        name: migrationName,
      });

      clearAlert();
    } catch (error) {
      console.error('Failed to execute backend action:', error);
      postMessage(
        `*Error executing database change. Fix the SQL and try again.*\n\`\`\`\n${error instanceof Error ? error.message : String(error)}\n\`\`\`\n`,
      );
    } finally {
      setIsExecuting(false);
    }
  };

  useEffect(() => {
    if (!isStudioManaged || !content?.trim() || isExecuting || autoAppliedRef.current) {
      return;
    }

    autoAppliedRef.current = true;
    void executeBackendAction(cleanSqlContent(content));
  }, [isStudioManaged, content, title, isExecuting]);

  const cleanSqlContent = (value: string) => {
    if (!value) {
      return '';
    }

    let cleaned = value.replace(/\/\*[\s\S]*?\*\//g, '');
    cleaned = cleaned.replace(/(--).*$/gm, '').replace(/(#).*$/gm, '');

    return cleaned
      .split(';')
      .map((stmt) => stmt.trim())
      .filter((stmt) => stmt.length > 0)
      .join(';\n\n');
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        transition={{ duration: 0.3 }}
        className="max-w-chat rounded-lg border-l-2 border-l-[#098F5F] border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2"
      >
        <div className="p-4 pb-2">
          <div className="flex items-center gap-2">
            <div className="i-ph:database text-[#3DCB8F] text-lg" />
            <h3 className="text-sm font-medium text-[#3DCB8F]">
              {isStudioManaged ? 'Indobase Database' : title}
            </h3>
          </div>
        </div>

        <div className="px-4">
          {!isConnected ? (
            <div className="p-3 rounded-md bg-bolt-elements-background-depth-3">
              <span className="text-sm text-bolt-elements-textPrimary">{message}</span>
            </div>
          ) : (
            <>
              <div
                className="flex items-center p-2 rounded-md bg-bolt-elements-background-depth-3 cursor-pointer"
                onClick={() => setIsCollapsed(!isCollapsed)}
              >
                <div className="i-ph:database text-bolt-elements-textPrimary mr-2"></div>
                <span className="text-sm text-bolt-elements-textPrimary flex-grow">{description}</span>
                <div
                  className={`i-ph:caret-up text-bolt-elements-textPrimary transition-transform ${isCollapsed ? 'rotate-180' : ''}`}
                ></div>
              </div>

              {!isCollapsed && content && (
                <div className="mt-2 p-3 bg-bolt-elements-background-depth-4 rounded-md overflow-auto max-h-60 font-mono text-xs text-bolt-elements-textSecondary">
                  <pre>{cleanSqlContent(content)}</pre>
                </div>
              )}
            </>
          )}
        </div>

        <div className="p-4">
          <p className="text-sm text-bolt-elements-textSecondary mb-4">{message}</p>

          <div className="flex gap-2">
            {!isConnected ? (
              <button
                onClick={handleConnectClick}
                className={classNames(
                  `px-3 py-2 rounded-md text-sm font-medium`,
                  'bg-[#098F5F]',
                  'hover:bg-[#0aa06c]',
                  'focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500',
                  'text-white',
                  'flex items-center gap-1.5',
                )}
              >
                Connect to Backend
              </button>
            ) : (
              <button
                disabled
                className={classNames(
                  `px-3 py-2 rounded-md text-sm font-medium`,
                  'bg-[#098F5F]/70',
                  'text-white',
                  'opacity-80 cursor-default',
                )}
              >
                {isExecuting ? 'Applying to Indobase…' : 'Applied via Indobase'}
              </button>
            )}
            <button
              onClick={clearAlert}
              disabled={isExecuting}
              className={classNames(
                `px-3 py-2 rounded-md text-sm font-medium`,
                'bg-[#503B26]',
                'hover:bg-[#774f28]',
                'focus:outline-none',
                'text-[#F79007]',
                isExecuting ? 'opacity-70 cursor-not-allowed' : '',
              )}
            >
              Dismiss
            </button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
