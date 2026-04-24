import { DOCS_URL, IS_MULTI_ORG_DASHBOARD } from 'lib/constants'
import { Admonition } from 'ui-patterns/admonition'

/**
 * Explains shared-database behavior for self-hosted Studio so users aren't surprised
 * that schemas and data are visible across accounts on one Postgres instance.
 */
export function SelfHostedTenantNotice() {
  // Only show this in anonymous self-hosted “single-tenant” mode.
  // SaaS (Indobase SaaS or Supabase cloud) and self-hosted-with-auth are multi-org experiences.
  if (IS_MULTI_ORG_DASHBOARD) return null

  return (
    <div className="px-6 pt-4 pb-0 max-w-7xl mx-auto w-full">
      <Admonition
        type="default"
        title="Shared database on this instance"
        description={
          <>
            All users who can open Studio here are managing the same Postgres database unless you
            run separate stacks per customer. Use row-level security, separate databases, or
            dedicated deployments for tenant isolation. See your deployment docs for SMTP (password
            recovery email) and networking.{' '}
            <a
              href={DOCS_URL}
              target="_blank"
              rel="noreferrer"
              className="underline text-foreground-default"
            >
              Documentation
            </a>
          </>
        }
      />
    </div>
  )
}
