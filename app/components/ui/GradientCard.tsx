import React from 'react';
import { motion } from 'framer-motion';
import { classNames } from '~/utils/classNames';

// Predefined gradient colors
const GRADIENT_COLORS = [
  'from-accent-500/12 to-accent-200/5',
  'from-accent-400/10 to-orange-400/5',
  'from-orange-400/10 to-accent-300/5',
  'from-accent-300/10 to-yellow-400/5',
  'from-yellow-400/10 to-orange-500/5',
  'from-orange-500/10 to-red-400/5',
  'from-red-400/10 to-accent-400/5',
  'from-accent-600/10 to-accent-300/5',
];

interface GradientCardProps {
  /** Custom gradient class (overrides seed-based gradient) */
  gradient?: string;

  /** Seed string to determine gradient color */
  seed?: string;

  /** Whether to apply hover animation effect */
  hoverEffect?: boolean;

  /** Whether to apply border effect */
  borderEffect?: boolean;

  /** Card content */
  children: React.ReactNode;

  /** Additional class name */
  className?: string;

  /** Additional props */
  [key: string]: any;
}

/**
 * GradientCard component
 *
 * A card with a gradient background that can be determined by a seed string.
 */
export function GradientCard({
  gradient,
  seed,
  hoverEffect = true,
  borderEffect = true,
  className,
  children,
  ...props
}: GradientCardProps) {
  // Get gradient color based on seed or use provided gradient
  const gradientClass = gradient || getGradientColorFromSeed(seed);

  // Animation variants for hover effect
  const hoverAnimation = hoverEffect
    ? {
        whileHover: {
          scale: 1.02,
          y: -2,
          transition: { type: 'spring', stiffness: 400, damping: 17 },
        },
        whileTap: { scale: 0.98 },
      }
    : undefined;

  return (
    <motion.div
      className={classNames(
        'p-5 rounded-xl bg-gradient-to-br',
        gradientClass,
        borderEffect
          ? 'border border-bolt-elements-borderColor dark:border-bolt-elements-borderColor-dark hover:border-accent-500/40'
          : '',
        'transition-all duration-300 shadow-sm',
        hoverEffect ? 'hover:shadow-md' : '',
        className,
      )}
      {...hoverAnimation}
      {...props}
    >
      {children}
    </motion.div>
  );
}

/**
 * Calculate a gradient color based on the seed string for visual variety
 */
function getGradientColorFromSeed(seedString?: string): string {
  if (!seedString) {
    return GRADIENT_COLORS[0];
  }

  const index = seedString.length % GRADIENT_COLORS.length;

  return GRADIENT_COLORS[index];
}
