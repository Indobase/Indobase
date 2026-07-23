import { Flex } from '@ui/components'
import { Outlet } from 'react-router-dom'

import { IndobasePaymentsTitle } from '@/components/svg'
import { env } from '@/lib/env'
import { useForceTheme } from 'providers/ThemeProvider'

/**
 * Minimal Indobase chrome for transient auth routes (handoff errors / redirects).
 * Never shows Meteroid branding or password forms.
 */
export const AuthLayout = () => {
  useForceTheme('light')

  return (
    <div
      className="light min-h-screen flex flex-col overflow-hidden relative bg-background"
      style={{
        background:
          'radial-gradient(120% 80% at 50% -20%, rgba(59, 143, 214, 0.14) 0%, transparent 55%), #fafbfc',
      }}
    >
      <div className="p-6">
        <Flex justify="between" align="center">
          <IndobasePaymentsTitle forceTheme="light" />
          <div className="text-xs">
            <span className="text-muted-foreground mr-1">Use your Indobase Studio account</span>
            <a
              href={`${env.studioUrl.replace(/\/+$/, '')}/sign-in`}
              className="underline text-brand hover:opacity-90"
            >
              Sign in to Studio
            </a>
          </div>
        </Flex>
      </div>

      <Flex justify="center" align="center" className="grow pb-20">
        <Flex direction="column" className="p-10 w-96 gap-3 text-start relative z-10">
          <Outlet />
        </Flex>
      </Flex>
    </div>
  )
}
