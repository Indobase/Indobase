import { usePlatformAdminOverviewQuery } from 'data/platform-admin/platform-admin-query'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, Button } from 'ui'
import { PageContainer } from 'ui-patterns/PageContainer'
import {
  PageHeader,
  PageHeaderDescription,
  PageHeaderSummary,
  PageHeaderTitle,
} from 'ui-patterns/PageHeader'
import { GenericSkeletonLoader } from 'ui-patterns/ShimmeringLoader'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from 'components/ui/DataTable/Table'
import AlertError from 'components/ui/AlertError'
import { formatBytes, formatCount } from './formatUsage'

type HealthPayload = {
  status: string
  version?: string
  checks?: Record<string, { status: string; message?: string }>
}

export const PlatformAdminOverview = () => {
  const { data, isPending, isError, error } = usePlatformAdminOverviewQuery()
  const [health, setHealth] = useState<HealthPayload | null>(null)

  useEffect(() => {
    fetch('/api/health')
      .then((r) => r.json())
      .then(setHealth)
      .catch(() => setHealth(null))
  }, [])

  if (isPending) return <GenericSkeletonLoader />
  if (isError) return <AlertError error={error} subject="platform overview" />

  const stats = [
    { label: 'Organizations', value: data?.organizations ?? 0 },
    { label: 'Projects', value: data?.projects ?? 0 },
    { label: 'User profiles', value: data?.profiles ?? 0 },
    { label: 'Org memberships', value: data?.members ?? 0 },
    { label: 'New orgs (7d)', value: data?.recent_organizations_7d ?? 0 },
    { label: 'New projects (7d)', value: data?.recent_projects_7d ?? 0 },
    { label: 'New users (7d)', value: data?.recent_profiles_7d ?? 0 },
  ]

  const usage = data?.usage
  const usageStats =
    usage?.metering_enabled && usage
      ? [
          { label: 'API requests (30d)', value: formatCount(usage.requests_30d) },
          { label: 'Egress (30d)', value: formatBytes(usage.bytes_sent_30d) },
          { label: 'Errors (30d)', value: formatCount(usage.errors_30d) },
          {
            label: 'Active projects (30d)',
            value: formatCount(usage.active_projects_30d),
          },
        ]
      : []

  return (
    <PageContainer className="py-6 space-y-6">
      <PageHeader>
        <PageHeaderSummary>
          <PageHeaderTitle>Platform overview</PageHeaderTitle>
          <PageHeaderDescription>
            Cross-tenant metrics from the Indobase control plane. Data is read-only.
          </PageHeaderDescription>
        </PageHeaderSummary>
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-normal text-foreground-light">{s.label}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-medium tabular-nums">{s.value.toLocaleString()}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {usageStats.length > 0 && (
        <>
          <h3 className="text-sm font-medium text-foreground-light">Usage (last 30 days)</h3>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {usageStats.map((s) => (
              <Card key={s.label}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-normal text-foreground-light">
                    {s.label}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-medium tabular-nums">{s.value}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h3 className="text-sm font-medium text-foreground-light">Metering & tenant health</h3>
        <Button type="default" size="tiny" asChild>
          <Link href="/platform-admin/health">Open health dashboard</Link>
        </Button>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-normal text-foreground-light">
              Usage events (24h)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-medium tabular-nums">
              {data?.metering?.events_last_24h?.toLocaleString() ?? '—'}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-normal text-foreground-light">
              Last usage event
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm font-mono text-foreground truncate">
              {data?.metering?.last_event_occurred_at
                ? new Date(data.metering.last_event_occurred_at).toLocaleString()
                : data?.metering?.metering_enabled
                  ? 'None yet'
                  : 'N/A'}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-normal text-foreground-light">
              Unhealthy projects
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-medium tabular-nums">
              {data?.problems?.unhealthy_projects?.toLocaleString() ?? '—'}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-normal text-foreground-light">
              Provision failures
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-medium tabular-nums">
              {data?.problems?.provision_failed_projects?.toLocaleString() ?? '—'}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Projects by status</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Count</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data?.projects_by_status ?? []).map((row) => (
                  <TableRow key={row.status}>
                    <TableCell className="font-mono text-xs">{row.status}</TableCell>
                    <TableCell className="text-right tabular-nums">{row.count}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Studio health</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {health ? (
              <>
                <p>
                  Status:{' '}
                  <span className={health.status === 'ok' ? 'text-brand' : 'text-warning'}>
                    {health.status}
                  </span>
                </p>
                {health.version && (
                  <p className="font-mono text-xs text-foreground-light truncate">
                    Version: {health.version}
                  </p>
                )}
                {health.checks && (
                  <ul className="space-y-1 mt-3">
                    {Object.entries(health.checks).map(([name, check]) => (
                      <li key={name} className="flex justify-between gap-2">
                        <span className="text-foreground-light">{name}</span>
                        <span className={check.status === 'ok' ? 'text-brand' : 'text-warning'}>
                          {check.status}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            ) : (
              <p className="text-foreground-light">Could not load /api/health</p>
            )}
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  )
}
