import { useQuery } from '@tanstack/react-query'

import type {
  PlatformAdminAuditLog,
  PlatformAdminAuditLogFilters,
  PlatformAdminOrganization,
  PlatformAdminOrganizationDetail,
  PlatformAdminOverview,
  PlatformAdminProblemProject,
  PlatformAdminProject,
  PlatformAdminUsageReport,
  PlatformAdminUser,
} from 'lib/api/saas/platform-admin'
import { fetchGet } from 'data/fetchers'
import { API_URL } from 'lib/constants'
import type { UseCustomQueryOptions } from 'types'
import { ResponseError } from 'types'
import { platformAdminKeys } from './keys'

function adminUrl(path: string, query?: Record<string, string | number | undefined>) {
  const base = `${API_URL}/platform/admin${path}`
  if (!query) return base
  const params = new URLSearchParams()
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== '') params.set(key, String(value))
  })
  const qs = params.toString()
  return qs ? `${base}?${qs}` : base
}

async function adminFetch<T>(url: string, signal?: AbortSignal): Promise<T> {
  const data = await fetchGet<T>(url, { abortSignal: signal })
  if (data instanceof ResponseError) throw data
  return data as T
}

export type PlatformAdminAuditLogsResult = {
  items: PlatformAdminAuditLog[]
  total: number
}

function auditFilterKey(filters: PlatformAdminAuditLogFilters): string {
  return JSON.stringify(filters)
}

export async function getPlatformOperatorStatus(signal?: AbortSignal) {
  return adminFetch<{ is_platform_operator: boolean }>(adminUrl('/me'), signal)
}

export async function getPlatformAdminOverviewData(signal?: AbortSignal) {
  return adminFetch<PlatformAdminOverview>(adminUrl('/overview'), signal)
}

export async function getPlatformAdminOrganizations(
  {
    search = '',
    limit = 50,
    offset = 0,
  }: { search?: string; limit?: number; offset?: number },
  signal?: AbortSignal
) {
  return adminFetch<PlatformAdminOrganization[]>(
    adminUrl('/organizations', { search, limit, offset }),
    signal
  )
}

export async function getPlatformAdminProjects(
  {
    search = '',
    limit = 50,
    offset = 0,
  }: { search?: string; limit?: number; offset?: number },
  signal?: AbortSignal
) {
  return adminFetch<PlatformAdminProject[]>(
    adminUrl('/projects', { search, limit, offset }),
    signal
  )
}

export async function getPlatformAdminUsers(
  {
    search = '',
    limit = 50,
    offset = 0,
  }: { search?: string; limit?: number; offset?: number },
  signal?: AbortSignal
) {
  return adminFetch<PlatformAdminUser[]>(adminUrl('/users', { search, limit, offset }), signal)
}

export async function getPlatformAdminAuditLogs(
  {
    limit = 100,
    offset = 0,
    filters = {},
  }: { limit?: number; offset?: number; filters?: PlatformAdminAuditLogFilters } = {},
  signal?: AbortSignal
) {
  const q: Record<string, string | number | undefined> = { limit, offset }
  if (filters.search) q.search = filters.search
  if (filters.action) q.action = filters.action
  if (filters.actor_gotrue_id) q.actor_gotrue_id = filters.actor_gotrue_id
  if (filters.organization_id != null) q.organization_id = filters.organization_id
  if (filters.project_ref) q.project_ref = filters.project_ref
  if (filters.from) q.from = filters.from
  if (filters.to) q.to = filters.to
  return adminFetch<PlatformAdminAuditLogsResult>(adminUrl('/audit-logs', q), signal)
}

export async function getPlatformAdminUsageReportData(
  { days = 30 }: { days?: number },
  signal?: AbortSignal
) {
  return adminFetch<PlatformAdminUsageReport>(adminUrl('/usage', { days }), signal)
}

export async function getPlatformAdminOrganizationDetailData(
  slug: string,
  signal?: AbortSignal
) {
  const path = `/organizations/${encodeURIComponent(slug)}`
  return adminFetch<PlatformAdminOrganizationDetail>(adminUrl(path), signal)
}

export async function getPlatformAdminProblemsData(
  { limit = 100 }: { limit?: number } = {},
  signal?: AbortSignal
) {
  return adminFetch<PlatformAdminProblemProject[]>(adminUrl('/problems', { limit }), signal)
}

export const usePlatformOperatorQuery = (
  options: UseCustomQueryOptions<{ is_platform_operator: boolean }> = {}
) =>
  useQuery({
    queryKey: platformAdminKeys.operator,
    queryFn: ({ signal }) => getPlatformOperatorStatus(signal),
    staleTime: 60_000,
    ...options,
  })

export const usePlatformAdminOverviewQuery = (
  options: UseCustomQueryOptions<PlatformAdminOverview> = {}
) =>
  useQuery({
    queryKey: platformAdminKeys.overview,
    queryFn: ({ signal }) => getPlatformAdminOverviewData(signal),
    ...options,
  })

export const usePlatformAdminOrganizationsQuery = (
  {
    search = '',
    limit = 50,
    offset = 0,
  }: { search?: string; limit?: number; offset?: number },
  options: UseCustomQueryOptions<PlatformAdminOrganization[]> = {}
) =>
  useQuery({
    queryKey: platformAdminKeys.organizations(search, limit, offset),
    queryFn: ({ signal }) => getPlatformAdminOrganizations({ search, limit, offset }, signal),
    ...options,
  })

export const usePlatformAdminProjectsQuery = (
  {
    search = '',
    limit = 50,
    offset = 0,
  }: { search?: string; limit?: number; offset?: number },
  options: UseCustomQueryOptions<PlatformAdminProject[]> = {}
) =>
  useQuery({
    queryKey: platformAdminKeys.projects(search, limit, offset),
    queryFn: ({ signal }) => getPlatformAdminProjects({ search, limit, offset }, signal),
    ...options,
  })

export const usePlatformAdminUsersQuery = (
  {
    search = '',
    limit = 50,
    offset = 0,
  }: { search?: string; limit?: number; offset?: number },
  options: UseCustomQueryOptions<PlatformAdminUser[]> = {}
) =>
  useQuery({
    queryKey: platformAdminKeys.users(search, limit, offset),
    queryFn: ({ signal }) => getPlatformAdminUsers({ search, limit, offset }, signal),
    ...options,
  })

export const usePlatformAdminAuditLogsQuery = (
  {
    limit = 100,
    offset = 0,
    filters = {},
  }: { limit?: number; offset?: number; filters?: PlatformAdminAuditLogFilters } = {},
  options: UseCustomQueryOptions<PlatformAdminAuditLogsResult> = {}
) =>
  useQuery({
    queryKey: platformAdminKeys.auditLogs(limit, offset, auditFilterKey(filters)),
    queryFn: ({ signal }) => getPlatformAdminAuditLogs({ limit, offset, filters }, signal),
    ...options,
  })

export const usePlatformAdminUsageQuery = (
  { days = 30 }: { days?: number } = {},
  options: UseCustomQueryOptions<PlatformAdminUsageReport> = {}
) =>
  useQuery({
    queryKey: platformAdminKeys.usage(days ?? 30),
    queryFn: ({ signal }) => getPlatformAdminUsageReportData({ days }, signal),
    ...options,
  })

export const usePlatformAdminOrganizationDetailQuery = (
  slug: string,
  options: UseCustomQueryOptions<PlatformAdminOrganizationDetail> = {}
) =>
  useQuery({
    queryKey: platformAdminKeys.organization(slug),
    queryFn: ({ signal }) => getPlatformAdminOrganizationDetailData(slug, signal),
    enabled: Boolean(slug),
    ...options,
  })

export const usePlatformAdminProblemsQuery = (
  { limit = 100 }: { limit?: number } = {},
  options: UseCustomQueryOptions<PlatformAdminProblemProject[]> = {}
) =>
  useQuery({
    queryKey: platformAdminKeys.problems(limit),
    queryFn: ({ signal }) => getPlatformAdminProblemsData({ limit }, signal),
    ...options,
  })
