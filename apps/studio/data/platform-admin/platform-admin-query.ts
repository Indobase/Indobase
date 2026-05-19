import { useQuery } from '@tanstack/react-query'

import type {
  PlatformAdminAuditLog,
  PlatformAdminOrganization,
  PlatformAdminOverview,
  PlatformAdminProject,
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
  { limit = 100, offset = 0 }: { limit?: number; offset?: number },
  signal?: AbortSignal
) {
  return adminFetch<PlatformAdminAuditLog[]>(adminUrl('/audit-logs', { limit, offset }), signal)
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
  { limit = 100, offset = 0 }: { limit?: number; offset?: number },
  options: UseCustomQueryOptions<PlatformAdminAuditLog[]> = {}
) =>
  useQuery({
    queryKey: platformAdminKeys.auditLogs(limit, offset),
    queryFn: ({ signal }) => getPlatformAdminAuditLogs({ limit, offset }, signal),
    ...options,
  })
