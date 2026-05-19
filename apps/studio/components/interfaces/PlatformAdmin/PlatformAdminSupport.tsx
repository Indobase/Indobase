import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from 'ui'
import { PageContainer } from 'ui-patterns/PageContainer'
import {
  PageHeader,
  PageHeaderDescription,
  PageHeaderSummary,
  PageHeaderTitle,
} from 'ui-patterns/PageHeader'
import { Admonition } from 'ui-patterns/admonition'

const RUNBOOK = [
  {
    title: 'Tenant cannot sign in',
    steps: [
      'Open Users → search email → try Suspend off if they were banned.',
      'Check Organization detail for platform_suspended restriction.',
      'Review Audit logs filtered by actor or action for recent changes.',
    ],
  },
  {
    title: 'Usage looks empty',
    steps: [
      'Open Health → confirm metering events in last 24h.',
      'Verify Vector → Postgres sink and saas.usage_events on the control-plane DB.',
    ],
  },
  {
    title: 'Billing / plan wrong',
    steps: [
      'Organization detail → Billing & subscription (plan, Stripe id, usage billing flag).',
      'Changes are audited; prefer editing over delete when possible.',
    ],
  },
  {
    title: 'Destructive cleanup',
    steps: [
      'Transfer org ownership before deleting a user who owns orgs.',
      'Delete org removes control-plane projects only — confirm tenant stacks separately.',
    ],
  },
]

export const PlatformAdminSupport = () => {
  return (
    <PageContainer className="py-6 space-y-6">
      <PageHeader>
        <PageHeaderSummary>
          <PageHeaderTitle>Support runbook</PageHeaderTitle>
          <PageHeaderDescription>
            Operator-facing workflows and links into the rest of platform admin. All actions are
            audited where the API records them.
          </PageHeaderDescription>
        </PageHeaderSummary>
      </PageHeader>

      <div className="flex flex-wrap gap-3">
        <Link
          className="text-sm text-brand hover:underline"
          href="/platform-admin/organizations"
        >
          Organizations
        </Link>
        <span className="text-foreground-light">·</span>
        <Link className="text-sm text-brand hover:underline" href="/platform-admin/users">
          Users
        </Link>
        <span className="text-foreground-light">·</span>
        <Link className="text-sm text-brand hover:underline" href="/platform-admin/health">
          Health
        </Link>
        <span className="text-foreground-light">·</span>
        <Link className="text-sm text-brand hover:underline" href="/platform-admin/usage">
          Usage
        </Link>
        <span className="text-foreground-light">·</span>
        <Link className="text-sm text-brand hover:underline" href="/platform-admin/audit">
          Audit logs
        </Link>
      </div>

      <Admonition
        type="default"
        title="Safer than delete-only"
        description="Suspend organizations (restriction), adjust billing fields, transfer ownership, attach internal support notes, ban/unban users at GoTrue, and use filtered audit before resorting to deletes."
      />

      <div className="grid gap-4 md:grid-cols-2">
        {RUNBOOK.map((section) => (
          <Card key={section.title}>
            <CardHeader>
              <CardTitle className="text-base">{section.title}</CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="list-decimal list-inside space-y-2 text-sm text-foreground-light">
                {section.steps.map((s) => (
                  <li key={s} className="text-foreground">
                    {s}
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        ))}
      </div>
    </PageContainer>
  )
}
