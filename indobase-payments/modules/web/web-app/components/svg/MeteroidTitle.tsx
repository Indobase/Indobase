import { memo } from 'react'
import SVG from 'react-inlinesvg'

import { useTheme } from 'providers/ThemeProvider'

interface Props {
  width?: number
  height?: number
  forceTheme?: 'dark' | 'light'
}

export const IndobasePaymentsTitle = memo(({ width = 160, height = 28, forceTheme }: Props) => {
  const { isDarkMode } = useTheme()

  const enforceDarkMode = forceTheme === 'dark' || (forceTheme === undefined && isDarkMode)

  return (
    <div className="w-40 h-7">
      <SVG
        src={`/img/indobase-logo-wordmark--${enforceDarkMode ? 'dark' : 'light'}.svg`}
        width={width}
        height={height}
      />
    </div>
  )
})
