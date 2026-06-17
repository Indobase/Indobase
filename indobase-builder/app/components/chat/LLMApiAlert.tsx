import { AnimatePresence, motion } from 'framer-motion';
import type { LlmErrorAlertType } from '~/types/actions';
import { classNames } from '~/utils/classNames';

interface Props {
  alert: LlmErrorAlertType;
  clearAlert: () => void;
}

export default function LlmErrorAlert({ alert, clearAlert }: Props) {
  const { title, description, errorType, provider } = alert;

  const getErrorIcon = () => {
    switch (errorType) {
      case 'authentication':
        return 'i-ph:key-duotone';
      case 'rate_limit':
        return 'i-ph:clock-duotone';
      case 'quota':
        return 'i-ph:warning-circle-duotone';
      default:
        return 'i-ph:warning-duotone';
    }
  };

  const getErrorMessage = () => {
    switch (errorType) {
      case 'authentication':
        if (description?.toLowerCase().includes('missing api key')) {
          return `Missing API key for ${provider}. Add your API key in Settings → Providers, or set it as an environment variable.`;
        }

        return 'Authentication failed for the selected model/provider. Please check your API key and try again.';
      case 'rate_limit':
        return 'Model capacity is busy right now. Please wait a moment before retrying.';
      case 'quota':
        return 'The selected model is unavailable right now. Please try another one.';
      default:
        return 'An error occurred while processing your request.';
    }
  };

  const apiKeyHelp =
    errorType === 'authentication' && description?.toLowerCase().includes('missing api key')
      ? provider === 'OpenRouter'
        ? {
            label: 'Get OpenRouter API key',
            href: 'https://openrouter.ai/settings/keys',
          }
        : null
      : null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        transition={{ duration: 0.3 }}
        className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4 mb-2"
      >
        <div className="flex items-start">
          <motion.div
            className="flex-shrink-0"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2 }}
          >
            <div className={`${getErrorIcon()} text-xl text-bolt-elements-button-danger-text`}></div>
          </motion.div>

          <div className="ml-3 flex-1">
            <motion.h3
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.1 }}
              className="text-sm font-medium text-bolt-elements-textPrimary"
            >
              {title}
            </motion.h3>

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2 }}
              className="mt-2 text-sm text-bolt-elements-textSecondary"
            >
              <p>{getErrorMessage()}</p>

              {description && (errorType === 'unknown' || errorType === 'authentication') && (
                <div className="text-xs text-bolt-elements-textSecondary p-2 bg-bolt-elements-background-depth-3 rounded mt-4 mb-4">
                  Error Details: {description}
                </div>
              )}
            </motion.div>

            <motion.div
              className="mt-4"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
            >
              <div className="flex gap-2">
                <button
                  onClick={clearAlert}
                  className={classNames(
                    'px-2 py-1.5 rounded-md text-sm font-medium',
                    'bg-bolt-elements-button-secondary-background',
                    'hover:bg-bolt-elements-button-secondary-backgroundHover',
                    'focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-bolt-elements-button-secondary-background',
                    'text-bolt-elements-button-secondary-text',
                  )}
                >
                  Dismiss
                </button>
                {apiKeyHelp && (
                  <a
                    href={apiKeyHelp.href}
                    target="_blank"
                    rel="noreferrer"
                    className={classNames(
                      'px-2 py-1.5 rounded-md text-sm font-medium',
                      'bg-bolt-elements-button-primary-background',
                      'hover:bg-bolt-elements-button-primary-backgroundHover',
                      'focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-bolt-elements-button-primary-background',
                      'text-bolt-elements-button-primary-text',
                      'inline-flex items-center gap-2',
                    )}
                  >
                    {apiKeyHelp.label}
                    <span className="i-ph:arrow-square-out w-4 h-4" />
                  </a>
                )}
              </div>
            </motion.div>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
