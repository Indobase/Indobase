import AlertError from 'components/ui/AlertError'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from 'components/ui/DataTable/Table'
import { usePlatformAdminUsageQuery } from 'data/platform-admin/platform-admin-query'
import Link from 'next/link'
import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from 'ui'
import { PageContainer } from 'ui-patterns/PageContainer'
import {
  PageHeader,
  PageHeaderDescription,
  PageHeaderSummary,
  PageHeaderTitle,
} from 'ui-patterns/PageHeader'
import { GenericSkeletonLoader } from 'ui-patterns/ShimmeringLoader'
import { Admonition } from 'ui-patterns/admonition'
import { formatBytes, formatCount } from './formatUsage'

const PERIOD_OPTIONS = [
  { label: '7 days', days: 7 },
  { label: '30 days', days: 30 },
  { label: '90 days', days: 90 },
]

export const PlatformAdminUsage = () => {
  const [days, setDays] = useState(30)
  const { data, isPending, isError, error } = usePlatformAdminUsageQuery({ days })

  if (isPending) return <GenericSkeletonLoader />
  if (isError) return <AlertError error={error} subject="platform usage" />

  return (
    <PageContainer className="py-6 space-y-6">
      <PageHeader>
        <PageHeaderSummary>
          <PageHeaderTitle>API usage</PageHeaderTitle>
          <PageHeaderDescription>
            Request and egress metering from nginx via Vector into{' '}
            <code className="text-code-inline">saas.usage_events</code>. User usage is aggregated
            across projects in organizations they belong to.
          </PageHeaderDescription>
        </PageHeaderSummary>
      </PageHeader>

      <div className="flex flex-wrap gap-2">
        {PERIOD_OPTIONS.map((opt) => (
          <button
            key={opt.days}
            type="button"
            onClick={() => setDays(opt.days)}
            className={`rounded-md border px-3 py-1 text-sm ${
              days === opt.days
                ? 'border-brand bg-brand-400/10 text-brand'
                : 'border-border text-foreground-light hover:text-foreground'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {data.metering_health && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Metering pipeline</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-sm">
            <div>
              <p className="text-foreground-light">Table</p>
              <p className="font-medium">
                {data.metering_health.metering_enabled ? 'Present' : 'Missing'}
              </p>
            </div>
            <div>
              <p className="text-foreground-light">Events (24h)</p>
              <p className="font-mono tabular-nums">
                {data.metering_health.events_last_24h.toLocaleString()}
              </p>
            </div>
            <div>
              <p className="text-foreground-light">Events (7d)</p>
              <p className="font-mono tabular-nums">
                {data.metering_health.events_last_7d.toLocaleString()}
              </p>
            </div>
            <div>
              <p className="text-foreground-light">Last event</p>
              <p className="font-mono text-xs truncate">
                {data.metering_health.last_event_occurred_at
                  ? new Date(data.metering_health.last_event_occurred_at).toLocaleString()
                  : data.metering_health.metering_enabled
                    ? 'No rows yet'
                    : '—'}
              </p>
            </div>
            <div className="sm:col-span-2 lg:col-span-4">
              <Link href="/platform-admin/health" className="text-brand text-sm hover:underline">
                Full health & problem projects →
              </Link>
            </div>
          </CardContent>
        </Card>
      )}

      {!data?.metering_enabled ? (
        <Admonition
          type="default"
          title="Usage metering not configured"
          description="Apply docker/volumes/db/saas-usage-metering.sql and ensure Vector writes to saas.usage_events (see docker/volumes/logs/vector.yml)."
        />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <UsageStatCard label="API requests" value={formatCount(data.totals.requests)} />
            <UsageStatCard label="Egress" value={formatBytes(data.totals.bytes_sent)} />
            <UsageStatCard label="4xx/5xx errors" value={formatCount(data.totals.errors)} />
            <UsageStatCard
              label="Active projects"
              value={formatCount(data.totals.active_projects)}
            />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Top organizations</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <UsageOrgTable rows={data.top_organizations} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Top projects</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <UsageProjectTable rows={data.top_projects} />
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Top users</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <UsageUserTable rows={data.top_users} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Daily breakdown</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Day</TableHead>
                    <TableHead className="text-right">Requests</TableHead>
                    <TableHead className="text-right">Egress</TableHead>
                    <TableHead className="text-right">Errors</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.daily.map((row) => (
                    <TableRow key={row.day}>
                      <TableCell className="font-mono text-xs">{row.day}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatCount(row.requests)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatBytes(row.bytes_sent)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatCount(row.errors)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </PageContainer>
  )
}

function UsageStatCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-normal text-foreground-light">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-medium tabular-nums">{value}</p>
      </CardContent>
    </Card>
  )
}

function UsageOrgTable({
  rows,
}: {
  rows: Array<{
    slug: string
    name: string
    plan: string
    requests: number
    bytes_sent: number
    errors: number
  }>
}) {
  if (!rows.length) {
    return <p className="p-4 text-sm text-foreground-light">No usage in this period.</p>
  }

  return (
    <div className="overflow-auto max-h-[420px]">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Organization</TableHead>
            <TableHead className="text-right">Requests</TableHead>
            <TableHead className="text-right">Egress</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.slug}>
              <TableCell>
                <Link
                  href={`/platform-admin/organizations/${row.slug}`}
                  className="text-brand hover:underline"
                >
                  {row.name}
                </Link>
                <p className="text-xs text-foreground-light">{row.plan}</p>
              </TableCell>
              <TableCell className="text-right tabular-nums">{formatCount(row.requests)}</TableCell>
              <TableCell className="text-right tabular-nums">
                {formatBytes(row.bytes_sent)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

function UsageProjectTable({
  rows,
}: {
  rows: Array<{
    ref: string
    name: string
    organization_slug: string
    requests: number
    bytes_sent: number
  }>
}) {
  if (!rows.length) {
    return <p className="p-4 text-sm text-foreground-light">No usage in this period.</p>
  }

  return (
    <div className="overflow-auto max-h-[420px]">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Project</TableHead>
            <TableHead className="text-right">Requests</TableHead>
            <TableHead className="text-right">Egress</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.ref}>
              <TableCell>
                <Link href={`/project/${row.ref}`} className="text-brand hover:underline">
                  {row.name}
                </Link>
                <p className="text-xs font-mono text-foreground-light">{row.ref}</p>
              </TableCell>
              <TableCell className="text-right tabular-nums">{formatCount(row.requests)}</TableCell>
              <TableCell className="text-right tabular-nums">
                {formatBytes(row.bytes_sent)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

function UsageUserTable({
  rows,
}: {
  rows: Array<{
    gotrue_id: string
    primary_email: string
    username: string
    org_count: number
    project_count: number
    requests: number
    bytes_sent: number
    errors: number
  }>
}) {
  if (!rows.length) {
    return (
      <p className="p-4 text-sm text-foreground-light">
        No user-associated usage in this period.
      </p>
    )
  }

  return (
    <div className="overflow-auto max-h-[420px]">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>User</TableHead>
            <TableHead className="text-right">Orgs</TableHead>
            <TableHead className="text-right">Projects</TableHead>
            <TableHead className="text-right">Requests</TableHead>
            <TableHead className="text-right">Egress</TableHead>
            <TableHead className="text-right">Errors</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.gotrue_id}>
              <TableCell>
                <p>{row.primary_email}</p>
                <p className="text-xs font-mono text-foreground-light">{row.username}</p>
              </TableCell>
              <TableCell className="text-right tabular-nums">{formatCount(row.org_count)}</TableCell>
              <TableCell className="text-right tabular-nums">
                {formatCount(row.project_count)}
              </TableCell>
              <TableCell className="text-right tabular-nums">{formatCount(row.requests)}</TableCell>
              <TableCell className="text-right tabular-nums">
                {formatBytes(row.bytes_sent)}
              </TableCell>
              <TableCell className="text-right tabular-nums">{formatCount(row.errors)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
