import { isError } from 'lodash'
import Link from 'next/link'
import { useRouter } from 'next/router'

import { useIsFeatureEnabled } from 'hooks/misc/useIsFeatureEnabled'
import { ClientSideExceptionHandler } from './ClientSideExceptionHandler'
import { InsertBeforeRemoveChildErrorHandler } from './InsertBeforeRemoveChildErrorHandler'

export type FallbackProps = {
  error: unknown
  resetErrorBoundary: (...args: unknown[]) => void
}

export const GlobalErrorBoundaryState = ({ error, resetErrorBoundary }: FallbackProps) => {
  const router = useRouter()
  const checkIsError = isError(error)

  const largeLogo = useIsFeatureEnabled('branding:large_logo')

  /*
   * Not everything thrown is an Error — minified bundles throw plain objects and undefined. Those
   * previously fell through to '' here, which blanked the on-screen message *and* shipped an empty
   * `error=` to the support form, so the user's bug report carried no diagnostic payload at all.
   * Describe the value instead, and always include the path so the report locates the crash.
   */
  const describeThrown = (value: unknown): string => {
    if (isError(value)) return value.message
    if (value === undefined) return 'undefined was thrown'
    if (value === null) return 'null was thrown'

    if (typeof value === 'object') {
      try {
        const json = JSON.stringify(value)
        if (json && json !== '{}') return `Non-Error thrown: ${json}`
      } catch {
        // circular / non-serialisable — fall through to the constructor name
      }

      return `Non-Error thrown: ${value.constructor?.name ?? 'object'}`
    }

    return `Non-Error thrown: ${String(value)}`
  }

  const errorMessage = describeThrown(error)
  const urlMessage = `Path name: ${router.pathname}\n\n${
    checkIsError && error.stack ? error.stack : errorMessage
  }`

  const isRemoveChildError = checkIsError
    ? errorMessage.includes("Failed to execute 'removeChild' on 'Node'")
    : false
  const isInsertBeforeError = checkIsError
    ? errorMessage.includes("Failed to execute 'insertBefore' on 'Node'")
    : false

  // Get Sentry issue ID from error if available
  const sentryIssueId = (!!error && typeof error === 'object' && (error as any).sentryId) ?? ''

  return (
    <div className="w-screen mx-auto h-screen flex items-center justify-center">
      <header className="h-12 absolute top-0 w-full border-b px-4 flex items-center">
        <Link href="/" className="items-center justify-center">
          <img
            alt="Indobase Logo"
            src={`${router.basePath}/img/indobase-logo.svg`}
            className={largeLogo ? 'h-[20px]' : 'h-[18px]'}
          />
        </Link>
      </header>

      <div className="flex flex-col gap-y-4 max-w-full sm:max-w-[660px] px-4 sm:px-0">
        {isRemoveChildError || isInsertBeforeError ? (
          <InsertBeforeRemoveChildErrorHandler
            message={errorMessage}
            sentryIssueId={sentryIssueId}
            urlMessage={urlMessage}
            isRemoveChildError={isRemoveChildError}
            isInsertBeforeError={isInsertBeforeError}
          />
        ) : (
          <ClientSideExceptionHandler
            message={errorMessage}
            sentryIssueId={sentryIssueId}
            urlMessage={urlMessage}
            resetErrorBoundary={resetErrorBoundary}
          />
        )}
      </div>
    </div>
  )
}
