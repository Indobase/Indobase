import AlertError from 'components/ui/AlertError'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from 'components/ui/DataTable/Table'
import {
  usePlatformAdminAuditLogsQuery,
  usePlatformAdminOrganizationsQuery,
  usePlatformAdminProjectsQuery,
  usePlatformAdminUsersQuery,
} from 'data/platform-admin/platform-admin-query'
import { Search } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'
import { PageContainer } from 'ui-patterns/PageContainer'
import {
  PageHeader,
  PageHeaderDescription,
  PageHeaderSummary,
  PageHeaderTitle,
} from 'ui-patterns/PageHeader'
import { GenericSkeletonLoader } from 'ui-patterns/ShimmeringLoader'
import { Input } from 'ui-patterns/DataInputs/Input'
import { Badge } from 'ui'
import { formatBytes, formatCount } from './formatUsage'

const PAGE_SIZE = 50

function AdminSearchBar({
  placeholder,
  value,
  onChange,
}: {
  placeholder: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <Input
      size="tiny"
      placeholder={placeholder}
      icon={<Search />}
      className="w-full max-w-sm"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  )
}

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return iso
  }
}

export const PlatformAdminOrganizations = () => {
  const [search, setSearch] = useState('')
  const { data, isPending, isError, error } = usePlatformAdminOrganizationsQuery({
    search,
    limit: PAGE_SIZE,
    offset: 0,
  })

  const showUsage = (data ?? []).some((org) => org.requests_30d !== undefined)

  return (
    <PageContainer className="py-6 space-y-4">
      <PageHeader>
        <PageHeaderSummary>
          <PageHeaderTitle>Organizations</PageHeaderTitle>
          <PageHeaderDescription>
            All organizations on the platform (up to {PAGE_SIZE}
            {showUsage ? ', sorted by 30d API usage' : ''}).
          </PageHeaderDescription>
        </PageHeaderSummary>
      </PageHeader>
      <AdminSearchBar placeholder="Search name or slug…" value={search} onChange={setSearch} />
      {isPending ? (
        <GenericSkeletonLoader />
      ) : isError ? (
        <AlertError error={error} subject="organizations" />
      ) : (
        <div className="border rounded-md overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Slug</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead className="text-right">Members</TableHead>
                <TableHead className="text-right">Projects</TableHead>
                {showUsage && (
                  <>
                    <TableHead className="text-right">Requests (30d)</TableHead>
                    <TableHead className="text-right">Egress (30d)</TableHead>
                  </>
                )}
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data ?? []).map((org) => (
                <TableRow key={org.id}>
                  <TableCell>
                    <Link href={`/org/${org.slug}`} className="text-brand hover:underline">
                      {org.name}
                    </Link>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{org.slug}</TableCell>
                  <TableCell>{org.plan}</TableCell>
                  <TableCell className="text-right tabular-nums">{org.member_count}</TableCell>
                  <TableCell className="text-right tabular-nums">{org.project_count}</TableCell>
                  {showUsage && (
                    <>
                      <TableCell className="text-right tabular-nums">
                        {formatCount(org.requests_30d ?? 0)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatBytes(org.bytes_sent_30d ?? 0)}
                      </TableCell>
                    </>
                  )}
                  <TableCell className="text-foreground-light text-xs whitespace-nowrap">
                    {formatDate(org.created_at)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </PageContainer>
  )
}

export const PlatformAdminProjects = () => {
  const [search, setSearch] = useState('')
  const { data, isPending, isError, error } = usePlatformAdminProjectsQuery({
    search,
    limit: PAGE_SIZE,
    offset: 0,
  })

  const showUsage = (data ?? []).some((p) => p.requests_30d !== undefined)

  return (
    <PageContainer className="py-6 space-y-4">
      <PageHeader>
        <PageHeaderSummary>
          <PageHeaderTitle>Projects</PageHeaderTitle>
          <PageHeaderDescription>
            All projects (up to {PAGE_SIZE}
            {showUsage ? ', sorted by 30d API usage' : ''}).
          </PageHeaderDescription>
        </PageHeaderSummary>
      </PageHeader>
      <AdminSearchBar placeholder="Search ref, name, or org…" value={search} onChange={setSearch} />
      {isPending ? (
        <GenericSkeletonLoader />
      ) : isError ? (
        <AlertError error={error} subject="projects" />
      ) : (
        <div className="border rounded-md overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Ref</TableHead>
                <TableHead>Organization</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>DB</TableHead>
                <TableHead>Region</TableHead>
                {showUsage && (
                  <>
                    <TableHead className="text-right">Requests (30d)</TableHead>
                    <TableHead className="text-right">Egress (30d)</TableHead>
                  </>
                )}
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data ?? []).map((p) => (
                <TableRow key={p.ref}>
                  <TableCell>
                    <Link href={`/project/${p.ref}`} className="text-brand hover:underline">
                      {p.name}
                    </Link>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{p.ref}</TableCell>
                  <TableCell>
                    <Link href={`/org/${p.organization_slug}`} className="hover:underline text-xs">
                      {p.organization_name}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Badge variant={p.status === 'ACTIVE_HEALTHY' ? 'default' : 'warning'}>
                      {p.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs">
                    {p.has_dedicated_db ? 'Dedicated' : 'Shared'}
                  </TableCell>
                  <TableCell className="text-xs text-foreground-light">{p.region}</TableCell>
                  {showUsage && (
                    <>
                      <TableCell className="text-right tabular-nums">
                        {formatCount(p.requests_30d ?? 0)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatBytes(p.bytes_sent_30d ?? 0)}
                      </TableCell>
                    </>
                  )}
                  <TableCell className="text-foreground-light text-xs whitespace-nowrap">
                    {formatDate(p.inserted_at)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </PageContainer>
  )
}

export const PlatformAdminUsers = () => {
  const [search, setSearch] = useState('')
  const { data, isPending, isError, error } = usePlatformAdminUsersQuery({
    search,
    limit: PAGE_SIZE,
    offset: 0,
  })

  return (
    <PageContainer className="py-6 space-y-4">
      <PageHeader>
        <PageHeaderSummary>
          <PageHeaderTitle>Users</PageHeaderTitle>
          <PageHeaderDescription>
            Control-plane profiles (GoTrue accounts with a Studio profile).
          </PageHeaderDescription>
        </PageHeaderSummary>
      </PageHeader>
      <AdminSearchBar placeholder="Search email or username…" value={search} onChange={setSearch} />
      {isPending ? (
        <GenericSkeletonLoader />
      ) : isError ? (
        <AlertError error={error} subject="users" />
      ) : (
        <div className="border rounded-md overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Username</TableHead>
                <TableHead>Name</TableHead>
                <TableHead className="text-right">Orgs</TableHead>
                <TableHead>User ID</TableHead>
                <TableHead>Joined</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data ?? []).map((u) => (
                <TableRow key={u.gotrue_id}>
                  <TableCell>{u.primary_email}</TableCell>
                  <TableCell className="font-mono text-xs">{u.username}</TableCell>
                  <TableCell className="text-sm">
                    {[u.first_name, u.last_name].filter(Boolean).join(' ') || '—'}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{u.org_count}</TableCell>
                  <TableCell className="font-mono text-xs text-foreground-light max-w-[120px] truncate">
                    {u.gotrue_id}
                  </TableCell>
                  <TableCell className="text-foreground-light text-xs whitespace-nowrap">
                    {formatDate(u.inserted_at)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </PageContainer>
  )
}

export const PlatformAdminAudit = () => {
  const { data, isPending, isError, error } = usePlatformAdminAuditLogsQuery({
    limit: 100,
    offset: 0,
  })

  return (
    <PageContainer className="py-6 space-y-4">
      <PageHeader>
        <PageHeaderSummary>
          <PageHeaderTitle>Audit logs</PageHeaderTitle>
          <PageHeaderDescription>Recent platform audit events (latest 100).</PageHeaderDescription>
        </PageHeaderSummary>
      </PageHeader>
      {isPending ? (
        <GenericSkeletonLoader />
      ) : isError ? (
        <AlertError error={error} subject="audit logs" />
      ) : (
        <div className="border rounded-md overflow-auto max-h-[70vh]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Actor</TableHead>
                <TableHead>Target</TableHead>
                <TableHead>Project</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data ?? []).map((log) => (
                <TableRow key={log.id}>
                  <TableCell className="text-xs whitespace-nowrap text-foreground-light">
                    {formatDate(log.occurred_at)}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{log.action}</TableCell>
                  <TableCell className="text-xs max-w-[160px] truncate">
                    {log.actor_email ?? log.actor_gotrue_id ?? '—'}
                  </TableCell>
                  <TableCell className="text-xs max-w-[200px] truncate">
                    {log.target_description ?? log.target_type}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{log.project_ref ?? '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </PageContainer>
  )
}
