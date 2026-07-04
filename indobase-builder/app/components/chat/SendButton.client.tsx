import { AnimatePresence, cubicBezier, motion } from 'framer-motion';
import { classNames } from '~/utils/classNames';

interface SendButtonProps {
  show: boolean;
  isStreaming?: boolean;
  disabled?: boolean;
  onClick?: (event: React.MouseEvent<HTMLButtonElement, MouseEvent>) => void;
  onImagesSelected?: (images: File[]) => void;
}

const customEasingFn = cubicBezier(0.4, 0, 0.2, 1);

export const SendButton = ({ show, isStreaming, disabled, onClick }: SendButtonProps) => {
  return (
    <AnimatePresence>
      {show ? (
        <motion.button
          title={isStreaming ? 'Stop generating' : 'Send message'}
          aria-label={isStreaming ? 'Stop generating' : 'Send message'}
          className={classNames(
            'absolute top-[18px] right-[22px] flex h-[34px] items-center justify-center gap-1.5 rounded-md text-white transition-theme',
            'disabled:cursor-not-allowed disabled:opacity-50',
            isStreaming
              ? // Distinct, prominent Stop button so a wrong/unwanted run is easy to cancel.
                'bg-red-500 px-2.5 shadow-[0_0_0_4px_rgba(239,68,68,0.18)] hover:bg-red-600'
              : 'w-[34px] bg-accent-500 hover:brightness-94',
          )}
          transition={{ ease: customEasingFn, duration: 0.17 }}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 10 }}
          disabled={disabled}
          onClick={(event) => {
            event.preventDefault();

            if (!disabled) {
              onClick?.(event);
            }
          }}
        >
          {isStreaming ? (
            <>
              <div className="i-ph:stop-fill text-base" />
              <span className="text-sm font-medium">Stop</span>
            </>
          ) : (
            <div className="i-ph:arrow-right text-lg" />
          )}
        </motion.button>
      ) : null}
    </AnimatePresence>
  );
};
