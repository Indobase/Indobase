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
import {
  usePlatformAdminOrganizationDeleteMutation,
  usePlatformAdminProjectDeleteMutation,
  usePlatformAdminUserDeleteMutation,
} from 'data/platform-admin/platform-admin-delete-mutation'
import { usePlatformAdminUserBanMutation } from 'data/platform-admin/platform-admin-mutations'
import type { PlatformAdminAuditLog, PlatformAdminAuditLogFilters } from 'lib/api/saas/platform-admin'
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
import { Badge, Button } from 'ui'
import ConfirmationModal from 'ui-patterns/Dialogs/ConfirmationModal'
import { AdminDeleteButton } from './AdminDeleteButton'
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
  const { mutateAsync: deleteOrg, isPending: isDeletingOrg } =
    usePlatformAdminOrganizationDeleteMutation()

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
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data ?? []).map((org) => (
                <TableRow key={org.id}>
                  <TableCell>
                    <Link
                      href={`/platform-admin/organizations/${org.slug}`}
                      className="text-brand hover:underline"
                    >
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
                  <TableCell className="text-right">
                    <AdminDeleteButton
                      label="Delete"
                      entityName={org.name}
                      description="Removes the organization row, its projects, members, invites, and other linked control-plane rows in Studio’s database."
                      loading={isDeletingOrg}
                      onConfirm={() => deleteOrg({ slug: org.slug })}
                    />
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
  const { mutateAsync: deleteProject, isPending: isDeletingProject } =
    usePlatformAdminProjectDeleteMutation()

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
                <TableHead className="text-right">Actions</TableHead>
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
                  <TableCell className="text-right">
                    <AdminDeleteButton
                      label="Delete"
                      entityName={p.name}
                      description="Removes the project row and related control-plane records (keys, audit links, etc.)."
                      loading={isDeletingProject}
                      onConfirm={() => deleteProject({ ref: p.ref })}
                    />
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
  const [banModal, setBanModal] = useState<{
    gotrueId: string
    email: string
    banned: boolean
  } | null>(null)
  const { data, isPending, isError, error } = usePlatformAdminUsersQuery({
    search,
    limit: PAGE_SIZE,
    offset: 0,
  })
  const { mutateAsync: deleteUser, isPending: isDeletingUser } =
    usePlatformAdminUserDeleteMutation()
  const { mutateAsync: patchBan, isPending: isBanning } = usePlatformAdminUserBanMutation()

  const showUsage = (data ?? []).some((u) => u.requests_30d !== undefined)

  return (
    <PageContainer className="py-6 space-y-4">
      <PageHeader>
        <PageHeaderSummary>
          <PageHeaderTitle>Users</PageHeaderTitle>
          <PageHeaderDescription>
            Control-plane profiles (GoTrue accounts with a Studio profile)
            {showUsage ? ', sorted by 30d API usage across member organizations.' : '.'}
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
                {showUsage && (
                  <>
                    <TableHead className="text-right">Requests (30d)</TableHead>
                    <TableHead className="text-right">Egress (30d)</TableHead>
                  </>
                )}
                <TableHead>User ID</TableHead>
                <TableHead>Joined</TableHead>
                <TableHead className="text-right">Actions</TableHead>
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
                  {showUsage && (
                    <>
                      <TableCell className="text-right tabular-nums">
                        {formatCount(u.requests_30d ?? 0)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatBytes(u.bytes_sent_30d ?? 0)}
                      </TableCell>
                    </>
                  )}
                  <TableCell className="font-mono text-xs text-foreground-light max-w-[120px] truncate">
                    {u.gotrue_id}
                  </TableCell>
                  <TableCell className="text-foreground-light text-xs whitespace-nowrap">
                    {formatDate(u.inserted_at)}
                  </TableCell>
                  <TableCell className="text-right space-x-2">
                    <Button
                      type="default"
                      size="tiny"
                      onClick={() =>
                        setBanModal({ gotrueId: u.gotrue_id, email: u.primary_email, banned: true })
                      }
                    >
                      Ban
                    </Button>
                    <Button
                      type="default"
                      size="tiny"
                      onClick={() =>
                        setBanModal({ gotrueId: u.gotrue_id, email: u.primary_email, banned: false })
                      }
                    >
                      Unban
                    </Button>
                    <AdminDeleteButton
                      label="Delete"
                      entityName={u.primary_email}
                      description="Removes the Studio profile, org memberships, and GoTrue account from the control plane. Users who own organizations must have those orgs deleted first."
                      loading={isDeletingUser}
                      onConfirm={() => deleteUser({ gotrueId: u.gotrue_id })}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <ConfirmationModal
        visible={Boolean(banModal)}
        variant={banModal?.banned ? 'destructive' : 'warning'}
        title={banModal?.banned ? 'Ban user (GoTrue)?' : 'Lift ban for user?'}
        confirmLabel={banModal?.banned ? 'Ban' : 'Unban'}
        loading={isBanning}
        onCancel={() => setBanModal(null)}
        onConfirm={async () => {
          if (!banModal) return
          await patchBan({ gotrueId: banModal.gotrueId, banned: banModal.banned })
          setBanModal(null)
        }}
        alert={{
          title: banModal?.banned ? 'Blocks sign-in' : 'Restores sign-in',
          description: banModal?.banned
            ? 'Applies a long-duration GoTrue ban. Studio profile is not removed.'
            : 'Clears GoTrue ban_duration so the user can sign in again.',
        }}
      >
        <p className="text-sm text-foreground-light">
          Account: <span className="text-foreground">{banModal?.email}</span>
        </p>
      </ConfirmationModal>
    </PageContainer>
  )
}

function auditCsvEscape(value: string | number | null | undefined) {
  const s = value === null || value === undefined ? '' : String(value)
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

function downloadAuditCsv(rows: PlatformAdminAuditLog[]) {
  const header = [
    'occurred_at',
    'action',
    'actor_email',
    'actor_gotrue_id',
    'organization_id',
    'project_ref',
    'target_description',
  ]
  const lines = [
    header.join(','),
    ...rows.map((r) =>
      [
        r.occurred_at,
        r.action,
        r.actor_email,
        r.actor_gotrue_id,
        r.organization_id ?? '',
        r.project_ref ?? '',
        r.target_description ?? '',
      ]
        .map(auditCsvEscape)
        .join(',')
    ),
  ]
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `platform-audit-${new Date().toISOString().slice(0, 19)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

export const PlatformAdminAudit = () => {
  const [filters, setFilters] = useState<PlatformAdminAuditLogFilters>({})
  const [draft, setDraft] = useState<PlatformAdminAuditLogFilters>({})
  const [offset, setOffset] = useState(0)
  const limit = 100

  const { data, isPending, isError, error } = usePlatformAdminAuditLogsQuery({
    limit,
    offset,
    filters,
  })

  const rows = data?.items ?? []
  const total = data?.total ?? 0

  const canNext = offset + rows.length < total
  const canPrev = offset > 0

  return (
    <PageContainer className="py-6 space-y-4">
      <PageHeader>
        <PageHeaderSummary>
          <PageHeaderTitle>Audit logs</PageHeaderTitle>
          <PageHeaderDescription>
            Filtered control-plane audit events ({total.toLocaleString()} matching). Pagination is
            server-side (max {limit} per page).
          </PageHeaderDescription>
        </PageHeaderSummary>
      </PageHeader>

      <div className="flex flex-wrap gap-3 items-end border rounded-md p-4">
        <div className="flex flex-col gap-1 min-w-[180px] flex-1">
          <label className="text-xs text-foreground-light">Search</label>
          <Input
            size="tiny"
            value={draft.search ?? ''}
            onChange={(e) => setDraft((d) => ({ ...d, search: e.target.value }))}
            placeholder="Email, action, description…"
          />
        </div>
        <div className="flex flex-col gap-1 w-40">
          <label className="text-xs text-foreground-light">Action</label>
          <Input
            size="tiny"
            value={draft.action ?? ''}
            onChange={(e) => setDraft((d) => ({ ...d, action: e.target.value }))}
            placeholder="org.delete"
          />
        </div>
        <div className="flex flex-col gap-1 w-44">
          <label className="text-xs text-foreground-light">Actor UUID</label>
          <Input
            size="tiny"
            className="font-mono text-xs"
            value={draft.actor_gotrue_id ?? ''}
            onChange={(e) => setDraft((d) => ({ ...d, actor_gotrue_id: e.target.value }))}
          />
        </div>
        <div className="flex flex-col gap-1 w-28">
          <label className="text-xs text-foreground-light">Org id</label>
          <Input
            size="tiny"
            value={draft.organization_id != null ? String(draft.organization_id) : ''}
            onChange={(e) => {
              const v = e.target.value.trim()
              setDraft((d) => ({
                ...d,
                organization_id: v === '' ? undefined : parseInt(v, 10) || undefined,
              }))
            }}
          />
        </div>
        <div className="flex flex-col gap-1 w-36">
          <label className="text-xs text-foreground-light">Project ref</label>
          <Input
            size="tiny"
            className="font-mono text-xs"
            value={draft.project_ref ?? ''}
            onChange={(e) => setDraft((d) => ({ ...d, project_ref: e.target.value }))}
          />
        </div>
        <div className="flex flex-col gap-1 w-40">
          <label className="text-xs text-foreground-light">From (ISO)</label>
          <Input
            size="tiny"
            className="font-mono text-xs"
            value={draft.from ?? ''}
            onChange={(e) => setDraft((d) => ({ ...d, from: e.target.value }))}
            placeholder="2026-01-01"
          />
        </div>
        <div className="flex flex-col gap-1 w-40">
          <label className="text-xs text-foreground-light">To (ISO)</label>
          <Input
            size="tiny"
            className="font-mono text-xs"
            value={draft.to ?? ''}
            onChange={(e) => setDraft((d) => ({ ...d, to: e.target.value }))}
          />
        </div>
        <Button
          type="primary"
          size="tiny"
          onClick={() => {
            setFilters({ ...draft })
            setOffset(0)
          }}
        >
          Apply
        </Button>
        <Button
          type="default"
          size="tiny"
          onClick={() => {
            setDraft({})
            setFilters({})
            setOffset(0)
          }}
        >
          Reset
        </Button>
        <Button
          type="default"
          size="tiny"
          disabled={!rows.length}
          onClick={() => downloadAuditCsv(rows)}
        >
          CSV (this page)
        </Button>
      </div>

      {isPending ? (
        <GenericSkeletonLoader />
      ) : isError ? (
        <AlertError error={error} subject="audit logs" />
      ) : (
        <>
          <div className="border rounded-md overflow-auto max-h-[70vh]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Actor</TableHead>
                  <TableHead>Target</TableHead>
                  <TableHead>Org</TableHead>
                  <TableHead>Project</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((log) => (
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
                    <TableCell className="text-xs tabular-nums">
                      {log.organization_id ?? '—'}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{log.project_ref ?? '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-foreground-light">
            <span>
              Showing {rows.length ? offset + 1 : 0}–{offset + rows.length} of {total}
            </span>
            <div className="flex gap-2">
              <Button type="default" size="tiny" disabled={!canPrev} onClick={() => setOffset((o) => Math.max(0, o - limit))}>
                Previous
              </Button>
              <Button type="default" size="tiny" disabled={!canNext} onClick={() => setOffset((o) => o + limit)}>
                Next
              </Button>
            </div>
          </div>
        </>
      )}
    </PageContainer>
  )
}
