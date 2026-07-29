import { useEffect } from 'react'
import { useTheme } from 'next-themes'

import { ensureMonacoIndobaseTheme } from 'lib/monaco-loader'

/**
 * Lazy-load Monaco theme when an editor route mounts this provider.
 * Avoids pulling Monaco into the org/projects first-load bundle.
 */
export const MonacoThemeProvider = () => {
  const { resolvedTheme } = useTheme()

  useEffect(() => {
    if (!resolvedTheme) return
    void ensureMonacoIndobaseTheme(resolvedTheme)
  }, [resolvedTheme])

  return null
}
