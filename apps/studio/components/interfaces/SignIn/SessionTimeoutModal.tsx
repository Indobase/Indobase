import { SupportCategories } from '@indobaseinc/shared-types/out/constants'
import * as Sentry from '@sentry/nextjs'
import { useEffect } from 'react'
import { toast } from 'sonner'

import { InlineLink, InlineLinkClassName } from 'components/ui/InlineLink'
import {
  AlertCollapsible,
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
} from 'ui'
import { SupportLink } from '../Support/SupportLink'
import { LOCAL_STORAGE_KEYS } from 'common'

interface SessionTimeoutModalProps {
  visible: boolean
  onClose: () => void
  redirectToSignIn: () => void
  /** Optional context so the support form can pre-populate when opened from this dialog */
  supportContext?: { projectRef?: string; orgSlug?: string }
}

export const SessionTimeoutModal = ({
  visible,
  onClose,
  redirectToSignIn,
  supportContext,
}: SessionTimeoutModalProps) => {
  useEffect(() => {
    if (visible) {
      Sentry.captureException(new Error('Session error detected'))
    }
  }, [visible])

  const handleClearStorage = () => {
    try {
      const localStorageKeysToClear: (string | RegExp)[] = [
        LOCAL_STORAGE_KEYS.LAST_VISITED_ORGANIZATION,
        LOCAL_STORAGE_KEYS.PROJECTS_VIEW,
        LOCAL_STORAGE_KEYS.HOTKEY_COMMAND_MENU,
        LOCAL_STORAGE_KEYS.MAINTENANCE_WINDOW_BANNER,
        LOCAL_STORAGE_KEYS.SIDEBAR_BEHAVIOR,
        LOCAL_STORAGE_KEYS.LINTER_SHOW_FOOTER,
        LOCAL_STORAGE_KEYS.CLS_DIFF_WARNING,
        LOCAL_STORAGE_KEYS.CLS_SELECT_STAR_WARNING,
        // Project-scoped + dynamic keys
        /^supabase\.studio\./,
        /^supabase_studio_/,
        /^studio_/,
      ]

      for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i)
        if (!key) continue
        if (
          localStorageKeysToClear.some((k) => (typeof k === 'string' ? k === key : k.test(key)))
        ) {
          localStorage.removeItem(key)
        }
      }
      sessionStorage.clear()
    } catch (e) {
      toast.error('Failed to clear browser storage')
    }
    window.location.reload()
  }

  return (
    <AlertDialog
      open={visible}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <AlertDialogContent size="small">
        <AlertDialogHeader>
          <AlertDialogTitle>Session expired</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-4">
              <p>Please sign in again to continue.</p>
              <AlertCollapsible trigger="Having trouble?">
                <div className="space-y-3 text-foreground-light">
                  <p>
                    Try a different browser or disable extensions that block network requests. If
                    the problem persists:
                  </p>
                  <Button type="default" size="tiny" onClick={handleClearStorage}>
                    Clear site data and reload
                  </Button>
                  <p>
                    Still stuck?{' '}
                    <SupportLink
                      className={InlineLinkClassName}
                      queryParams={{
                        subject: 'Session expired',
                        category: SupportCategories.LOGIN_ISSUES,
                        ...(supportContext?.projectRef && {
                          projectRef: supportContext.projectRef,
                        }),
                        ...(supportContext?.orgSlug && { orgSlug: supportContext.orgSlug }),
                      }}
                      onClick={onClose}
                    >
                      Contact support
                    </SupportLink>{' '}
                    and include a{' '}
                    <InlineLink href="https://github.com/orgs/Indobase/discussions/36540">
                      HAR file
                    </InlineLink>{' '}
                    from your session to help us investigate.
                  </p>
                </div>
              </AlertCollapsible>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Close</AlertDialogCancel>
          <AlertDialogAction onClick={redirectToSignIn}>Sign in again</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
