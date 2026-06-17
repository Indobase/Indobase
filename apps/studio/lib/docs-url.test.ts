import { describe, expect, it } from 'vitest'
import { docsUrl, resolveStudioDocsHref } from './docs-url'

describe('docsUrl', () => {
  it('maps auth email templates to indobase auth docs', () => {
    expect(docsUrl('guides/auth/auth-email-templates')).toBe(
      'https://indobase.in/docs/products/auth/email-password'
    )
  })

  it('maps database extensions to databases product docs', () => {
    expect(docsUrl('guides/database/extensions')).toBe(
      'https://indobase.in/docs/products/databases'
    )
  })

  it('maps function secrets to environment variables section', () => {
    expect(docsUrl('guides/functions/secrets')).toBe(
      'https://indobase.in/docs/products/functions/functions#environment-variables'
    )
  })

  it('rewrites supabase.com guide URLs to indobase', () => {
    expect(
      resolveStudioDocsHref('https://indobase.in/docs/guides/realtime/authorization')
    ).toBe('https://indobase.in/docs/products/databases/permissions')
  })

  it('preserves query strings when mapping', () => {
    expect(docsUrl('guides/database/database-linter?lint=0013_rls_disabled_in_public')).toBe(
      'https://indobase.in/docs/products/databases/permissions?lint=0013_rls_disabled_in_public'
    )
  })
})
