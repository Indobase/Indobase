import { motion } from 'framer-motion';
import { memo } from 'react';
import { classNames } from '~/utils/classNames';
import { cubicEasingFn } from '~/utils/easings';
import { genericMemo } from '~/utils/react';

export type SliderOptions<T> = {
  left: { value: T; text: string };
  middle?: { value: T; text: string };
  right: { value: T; text: string };
};

interface SliderProps<T> {
  selected: T;
  options: SliderOptions<T>;
  setSelected?: (selected: T) => void;
}

export const Slider = genericMemo(<T,>({ selected, options, setSelected }: SliderProps<T>) => {
  const hasMiddle = !!options.middle;
  const isLeftSelected = hasMiddle ? selected === options.left.value : selected === options.left.value;
  const isMiddleSelected = hasMiddle && options.middle ? selected === options.middle.value : false;

  return (
    <div className="flex items-center flex-wrap shrink-0 gap-1 bg-bolt-elements-background-depth-2 overflow-hidden rounded-full p-1">
      <SliderButton selected={isLeftSelected} setSelected={() => setSelected?.(options.left.value)}>
        {options.left.text}
      </SliderButton>

      {options.middle && (
        <SliderButton selected={isMiddleSelected} setSelected={() => setSelected?.(options.middle!.value)}>
          {options.middle.text}
        </SliderButton>
      )}

      <SliderButton
        selected={!isLeftSelected && !isMiddleSelected}
        setSelected={() => setSelected?.(options.right.value)}
      >
        {options.right.text}
      </SliderButton>
    </div>
  );
});

interface SliderButtonProps {
  selected: boolean;
  children: string | JSX.Element | Array<JSX.Element | string>;
  setSelected: () => void;
}

const SliderButton = memo(({ selected, children, setSelected }: SliderButtonProps) => {
  return (
    <button
      onClick={setSelected}
      className={classNames(
        'bg-transparent text-sm px-3 py-1 rounded-full relative transition-colors',
        selected
          ? 'text-bolt-elements-textPrimary font-medium'
          : 'text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary',
      )}
    >
      <span className="relative z-10">{children}</span>
      {selected && (
        <motion.span
          layoutId="pill-tab"
          transition={{ duration: 0.2, ease: cubicEasingFn }}
          className="absolute inset-0 z-0 rounded-full bg-bolt-elements-background-depth-1 shadow-sm ring-1 ring-bolt-elements-borderColor"
        ></motion.span>
      )}
    </button>
  );
});
