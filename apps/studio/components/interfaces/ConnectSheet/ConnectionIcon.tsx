import { useTheme } from 'next-themes'
import Image from 'next/image'

import { BASE_PATH } from 'lib/constants'
import { cn } from 'ui'

interface ConnectionIconProps {
  icon: string
  iconFolder?: string
  supportsDarkMode?: boolean
  size?: number
  className?: string
}

export const ConnectionIcon = ({
  icon,
  iconFolder,
  supportsDarkMode,
  size = 14,
  className,
}: ConnectionIconProps) => {
  const { resolvedTheme } = useTheme()

  const iconLower = icon.toLowerCase()

  const imageFolder =
    iconFolder || (['ionic-angular'].includes(icon) ? 'icons/frameworks' : 'libraries')

  const imageExtension = imageFolder === 'icons/frameworks' ? '' : '-icon'

  const shouldUseDarkMode =
    supportsDarkMode ||
    ['expo', 'nextjs', 'prisma', 'drizzle', 'astro', 'remix', 'refine'].includes(iconLower)

  const indobaseThemeVariant = resolvedTheme?.includes('dark') ? 'dark' : 'light'
  const iconImgSrc =
    iconLower === 'indobase'
      ? `${BASE_PATH}/img/indobase-${indobaseThemeVariant}.svg`
      : icon.startsWith('http')
        ? icon
        : `${BASE_PATH}/img/${imageFolder}/${iconLower}${
            shouldUseDarkMode && resolvedTheme?.includes('dark') ? '-dark' : ''
          }${imageExtension}.svg`

  return (
    <Image
      className={cn('transition-all group-hover:scale-110', className)}
      src={iconImgSrc}
      alt={`${icon} logo`}
      width={size}
      height={size}
    />
  )
}
