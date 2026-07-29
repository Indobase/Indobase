import 'react-data-grid/lib/styles.css'
import 'styles/code.scss'
import 'styles/contextMenu.scss'
import 'styles/editor.scss'
import 'styles/focus.scss'
import 'styles/graphiql-base.scss'
import 'styles/grid.scss'
import 'styles/main.scss'
import 'styles/markdown-preview.scss'
import 'styles/react-data-grid-logs.scss'
import 'styles/reactflow.scss'
import 'styles/storage.scss'
import 'styles/toast.scss'
import 'styles/typography.scss'
import 'styles/ui.scss'
import 'ui-patterns/ShimmeringLoader/index.css'
import 'ui/build/css/themes/dark.css'
import 'ui/build/css/themes/light.css'

import * as Sentry from '@sentry/nextjs'
import { HydrationBoundary, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import {
  FeatureFlagProvider,
  getFlags,
  hasConsented,
  isPostHogConfigured,
  posthogClient,
  TelemetryTagManager,
  ThemeProvider,
  useThemeSandbox,
} from 'common'
import MetaFaviconsPagesRouter from 'common/MetaFavicons/pages-router'
import { StudioCommandMenu } from 'components/interfaces/App/CommandMenu'
import { StudioCommandProvider as CommandProvider } from 'components/interfaces/App/CommandMenu/StudioCommandProvider'
import { FeaturePreviewContextProvider } from 'components/interfaces/App/FeaturePreview/FeaturePreviewContext'
import { FeaturePreviewModal } from 'components/interfaces/App/FeaturePreview/FeaturePreviewModal'
import { RouteValidationWrapper } from 'components/interfaces/App/RouteValidationWrapper'
import { MainScrollContainerProvider } from 'components/layouts/MainScrollContainerContext'
import { GlobalErrorBoundaryState } from 'components/ui/ErrorBoundary/GlobalErrorBoundaryState'
import { useRootQueryClient } from 'data/query-client'
import dayjs from 'dayjs'
import customParseFormat from 'dayjs/plugin/customParseFormat'
import duration from 'dayjs/plugin/duration'
import relativeTime from 'dayjs/plugin/relativeTime'
import timezone from 'dayjs/plugin/timezone'
import utc from 'dayjs/plugin/utc'
import { DevToolbar, DevToolbarProvider } from 'dev-tools'
import { customFont, sourceCodePro } from 'fonts'
import { useCustomContent } from 'hooks/custom-content/useCustomContent'
import { useSelectedOrganizationQuery } from 'hooks/misc/useSelectedOrganization'
import { AuthProvider } from 'lib/auth'
import { getSaasStudioConfigCatFlagValues } from 'lib/api/saas/platform-stubs'
import { API_URL, BASE_PATH, IS_SAAS, useDefaultProvider } from 'lib/constants'
import { TenantJwtClaimSync } from 'components/misc/TenantJwtClaimSync'
import { ProfileProvider } from 'lib/profile'
import { Telemetry } from 'lib/telemetry'
import Head from 'next/head'
import { NuqsAdapter } from 'nuqs/adapters/next/pages'
import { ErrorInfo, useCallback, useEffect, useState, type ComponentProps } from 'react'
import { ErrorBoundary } from 'react-error-boundary'
import { AiAssistantStateContextProvider } from 'state/ai-assistant-state'
import type { AppPropsWithLayout } from 'types'
import { LogoLoader, SonnerToaster, TooltipProvider } from 'ui'

dayjs.extend(customParseFormat)
dayjs.extend(utc)
dayjs.extend(timezone)
dayjs.extend(relativeTime)
dayjs.extend(duration)

const FeatureFlagProviderWithOrgContext = ({
  children,
  ...props
}: ComponentProps<typeof FeatureFlagProvider>) => {
  const { data: selectedOrganization } = useSelectedOrganizationQuery({
    enabled: true,
  })

  return (
    <FeatureFlagProvider {...props} organizationSlug={selectedOrganization?.slug ?? undefined}>
      {children}
    </FeatureFlagProvider>
  )
}

// [Joshen TODO] Once we settle on the new nav layout - we'll need a lot of clean up in terms of our layout components
// a lot of them are unnecessary and introduce way too many cluttered CSS especially with the height styles that make
// debugging way too difficult. Ideal scenario is we just have one AppLayout to control the height and scroll areas of
// the dashboard, all other layout components should not be doing that

function CustomApp({ Component, pageProps }: AppPropsWithLayout) {
  const queryClient = useRootQueryClient()
  const { appTitle } = useCustomContent(['app:title'])

  const getLayout = Component.getLayout ?? ((page) => page)

  const errorBoundaryHandler = (error: Error, info: ErrorInfo) => {
    Sentry.withScope(function (scope) {
      scope.setTag('globalErrorBoundary', true)
      const eventId = Sentry.captureException(error)
      // Attach the Sentry event ID to the error object so it can be accessed by the error boundary
      if (eventId && error && typeof error === 'object') {
        ;(error as any).sentryId = eventId
      }
    })

    if (hasConsented() && isPostHogConfigured()) {
      posthogClient.captureException(error, {
        boundary: 'global',
        component_stack: info.componentStack,
      })
    }

    console.error(error.stack)
  }

  useThemeSandbox()

  const isTestEnv = process.env.NEXT_PUBLIC_NODE_ENV === 'test'

  const cloudProvider = useDefaultProvider()

  const [isMounted, setIsMounted] = useState(false)

  useEffect(() => {
    setIsMounted(true)
  }, [])

  const getConfigCatFlags = useCallback(
    (userEmail?: string) => {
      if (
        IS_SAAS &&
        !process.env.NEXT_PUBLIC_CONFIGCAT_SDK_KEY &&
        !process.env.NEXT_PUBLIC_CONFIGCAT_PROXY_URL
      ) {
        return Promise.resolve(getSaasStudioConfigCatFlagValues())
      }
      const customAttributes = cloudProvider ? { cloud_provider: cloudProvider } : undefined
      return getFlags(userEmail, customAttributes)
    },
    [cloudProvider]
  )

  const preconnectOrigin = (() => {
    if (!IS_SAAS || typeof window === 'undefined') return null
    try {
      return new URL(API_URL, window.location.origin).origin
    } catch {
      return null
    }
  })()

  return (
    <ErrorBoundary FallbackComponent={GlobalErrorBoundaryState} onError={errorBoundaryHandler}>
      <QueryClientProvider client={queryClient}>
        <NuqsAdapter>
          <HydrationBoundary state={pageProps.dehydratedState}>
            <AuthProvider>
              <FeatureFlagProviderWithOrgContext
                API_URL={API_URL}
                enabled={true}
                getConfigCatFlags={getConfigCatFlags}
              >
                <ProfileProvider>
                  <TenantJwtClaimSync />
                  <Head>
                    <title>{appTitle ?? 'Indobase'}</title>
                    <meta name="viewport" content="initial-scale=1.0, width=device-width" />
                    <meta property="og:image" content={`${BASE_PATH}/img/indobase-brand.png`} />
                    <meta name="googlebot" content="notranslate" />
                    {/* [Alaister]: This has to be an inline style tag here and not a separate component due to next/font */}
                    <style
                      dangerouslySetInnerHTML={{
                        __html: `:root{--font-custom:${customFont.style.fontFamily};--font-source-code-pro:${sourceCodePro.style.fontFamily};}`,
                      }}
                    />
                    {/* Speed up initial API loading times by pre-connecting to the API domain */}
                    {preconnectOrigin && (
                      <link
                        rel="preconnect"
                        href={preconnectOrigin}
                        crossOrigin="use-credentials"
                      />
                    )}
                  </Head>
                  <MetaFaviconsPagesRouter applicationName="Indobase Studio" includeManifest />
                  <TooltipProvider delayDuration={0}>
                    <RouteValidationWrapper>
                      <ThemeProvider
                        defaultTheme="system"
                        themes={['dark', 'light', 'classic-dark']}
                        enableSystem
                        disableTransitionOnChange
                      >
                        <DevToolbarProvider apiUrl={API_URL}>
                          <AiAssistantStateContextProvider>
                            <CommandProvider>
                              <FeaturePreviewContextProvider>
                                <MainScrollContainerProvider>
                                  {isMounted ? (
                                    getLayout(<Component {...pageProps} />)
                                  ) : (
                                    <div className="flex h-screen w-screen items-center justify-center">
                                      <LogoLoader />
                                    </div>
                                  )}
                                </MainScrollContainerProvider>
                                <StudioCommandMenu />
                                <FeaturePreviewModal />
                              </FeaturePreviewContextProvider>
                              <SonnerToaster position="top-right" />
                            </CommandProvider>
                          </AiAssistantStateContextProvider>
                          <DevToolbar />
                        </DevToolbarProvider>
                      </ThemeProvider>
                    </RouteValidationWrapper>
                  </TooltipProvider>
                  <Telemetry />
                  {!isTestEnv && (
                    <ReactQueryDevtools initialIsOpen={false} buttonPosition="bottom-left" />
                  )}
                </ProfileProvider>
              </FeatureFlagProviderWithOrgContext>
            </AuthProvider>
          </HydrationBoundary>
        </NuqsAdapter>
      </QueryClientProvider>
      <TelemetryTagManager />
    </ErrorBoundary>
  )
}

export default CustomApp
