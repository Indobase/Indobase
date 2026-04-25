import React from 'react'

import styleHandler from '../../lib/theme/styleHandler'
import { cn } from '../../lib/utils/cn'

interface Props {
  children: React.ReactNode
  active: boolean
  isFullHeight?: boolean
}
export default function Loading({ children, active, isFullHeight = false }: Props) {
  const __styles = styleHandler('loading')

  let classNames = [__styles.base]

  let contentClasses = [__styles.content.base]

  if (active) {
    contentClasses.push(__styles.content.active)
  }

  let spinnerClasses = [__styles.spinner]

  return (
    <div className={cn(classNames.join(' '), isFullHeight && 'h-full')}>
      <div className={cn(contentClasses.join(' '), isFullHeight && 'h-full')}>{children}</div>
      {active && (
        <svg
          width="24"
          height="24"
          viewBox="0 0 32 32"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className={cn(spinnerClasses.join(' '), 'animate-pulse')}
        >
          <circle cx="10" cy="16" r="7" fill="#FF9933" />
          <circle cx="24" cy="16" r="4.5" fill="#FF9933" />
        </svg>
      )}
    </div>
  )
}
