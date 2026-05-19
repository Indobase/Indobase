import AlertError from 'components/ui/AlertError'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from 'components/ui/DataTable/Table'
import { usePlatformAdminOverviewQuery, usePlatformAdminProblemsQuery } from 'data/platform-admin/platform-admin-query'
import Link from 'next/link'
import { Badge } from 'ui'
import { PageContainer } from 'ui-patterns/PageContainer'
import {
  PageHeader,
  PageHeaderDescription,
  PageHeaderSummary,
  PageHeaderTitle,
} from 'ui-patterns/PageHeader'
import { GenericSkeletonLoader } from 'ui-patterns/ShimmeringLoader'
import { Admonition } from 'ui-patterns/admonition'

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return iso
  }
}

export const PlatformAdminHealth = () => {
  const { data: overview, isPending: overviewPending, isError: overviewError, error: overviewErr } =
    usePlatformAdminOverviewQuery()
  const { data: problems, isPending: problemsPending, isError: problemsError, error: problemsErr } =
    usePlatformAdminProblemsQuery({ limit: 100 })

  const metering = overview?.metering
  const summary = overview?.problems

  if (overviewPending) return <GenericSkeletonLoader />
  if (overviewError) return <AlertError error={overviewErr} subject="platform health" />

  return (
    <PageContainer className="py-6 space-y-6">
      <PageHeader>
        <PageHeaderSummary>
          <PageHeaderTitle>Platform health</PageHeaderTitle>
          <PageHeaderDescription>
            Usage metering freshness and projects that are unhealthy or reported a failed provision.
          </PageHeaderDescription>
        </PageHeaderSummary>
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-md border border-border p-4">
          <p className="text-sm text-foreground-light">Metering table</p>
          <p className="text-lg font-medium mt-1">
            {metering?.metering_enabled ? 'Present' : 'Missing'}
          </p>
        </div>
        <div className="rounded-md border border-border p-4">
          <p className="text-sm text-foreground-light">Events (24h)</p>
          <p className="text-2xl font-medium tabular-nums mt-1">
            {metering?.events_last_24h?.toLocaleString() ?? '—'}
          </p>
        </div>
        <div className="rounded-md border border-border p-4">
          <p className="text-sm text-foreground-light">Events (7d)</p>
          <p className="text-2xl font-medium tabular-nums mt-1">
            {metering?.events_last_7d?.toLocaleString() ?? '—'}
          </p>
        </div>
        <div className="rounded-md border border-border p-4">
          <p className="text-sm text-foreground-light">Last usage event</p>
          <p className="text-sm font-mono mt-1 text-foreground">
            {metering?.last_event_occurred_at
              ? formatDate(metering.last_event_occurred_at)
              : metering?.metering_enabled
                ? 'No events yet'
                : '—'}
          </p>
        </div>
      </div>

      {metering?.metering_enabled &&
        metering.events_last_24h === 0 &&
        metering.last_event_occurred_at === null && (
          <Admonition
            type="warning"
            title="No metering data yet"
            description="The usage_events table exists but has no rows. Confirm Vector is running and its Postgres sink matches docker/volumes/logs/vector.yml."
          />
        )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-md border border-border p-4">
          <p className="text-sm text-foreground-light">Unhealthy projects</p>
          <p className="text-2xl font-medium tabular-nums mt-1">
            {summary?.unhealthy_projects?.toLocaleString() ?? '—'}
          </p>
          <p className="text-xs text-foreground-light mt-1">Status is not ACTIVE_HEALTHY</p>
        </div>
        <div className="rounded-md border border-border p-4">
          <p className="text-sm text-foreground-light">Provision failed (last result)</p>
          <p className="text-2xl font-medium tabular-nums mt-1">
            {summary?.provision_failed_projects?.toLocaleString() ?? '—'}
          </p>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-medium mb-3">Problem projects</h3>
        {problemsPending ? (
          <GenericSkeletonLoader />
        ) : problemsError ? (
          <AlertError error={problemsErr} subject="problem projects" />
        ) : !problems?.length ? (
          <p className="text-sm text-foreground-light border rounded-md p-4">
            No projects match unhealthy or failed-provision criteria.
          </p>
        ) : (
          <div className="border rounded-md overflow-auto max-h-[60vh]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Project</TableHead>
                  <TableHead>Organization</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Reasons</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {problems.map((p) => (
                  <TableRow key={p.ref}>
                    <TableCell>
                      <Link href={`/project/${p.ref}`} className="text-brand hover:underline">
                        {p.name}
                      </Link>
                      <p className="text-xs font-mono text-foreground-light">{p.ref}</p>
                    </TableCell>
                    <TableCell>
                      <Link
                        href={`/platform-admin/organizations/${p.organization_slug}`}
                        className="text-sm hover:underline"
                      >
                        {p.organization_name}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Badge variant={p.status === 'ACTIVE_HEALTHY' ? 'default' : 'warning'}>
                        {p.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-foreground-light max-w-[240px]">
                      {p.problem_reasons.join(' · ')}
                    </TableCell>
                    <TableCell className="text-xs whitespace-nowrap text-foreground-light">
                      {formatDate(p.inserted_at)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </PageContainer>
  )
}
