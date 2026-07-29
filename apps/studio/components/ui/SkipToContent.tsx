import Link from 'next/link'

import { cn } from 'ui'

interface SkipToContentProps {
  targetId?: string
  className?: string
}

export function SkipToContent({ targetId = 'main-content', className }: SkipToContentProps) {
  return (
    <Link
      href={`#${targetId}`}
      className={cn(
        'sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-[100]',
        'focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:text-sm focus:shadow-md',
        className
      )}
    >
      Skip to content
    </Link>
  )
}
