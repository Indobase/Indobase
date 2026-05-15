import { useQuery } from '@tanstack/react-query'

import { API_URL } from 'lib/constants'
import { fetchGet } from 'data/fetchers'
import { ResponseError } from 'types'

export const tenantDataPlaneKeys = {
  stack: (ref: string | undefined) => ['project', ref, 'tenant-data-plane'] as const,
}

export type TenantStackArtifacts = {
  project_ref: string
  public_domain: string
  tenant_api_url?: string
  /** Present when `SAAS_TENANT_POOLER_HOST` is set (optional Supavisor / pooler in front of Postgres). */
  tenant_pooler?: { host: string; port: number } | null
  data_plane_port_base: number
  data_plane_last_provisioned_at?: string | null
  data_plane_last_provision_result?: Record<string, unknown> | null
  ports: Record<string, number>
  docker_compose_yml: string
  traefik_yml: string
}

export async function fetchTenantStack(ref: string): Promise<TenantStackArtifacts | null> {
  const url = `${API_URL}/platform/projects/${encodeURIComponent(ref)}/tenant-stack`
  const data = await fetchGet<TenantStackArtifacts | { message?: string }>(url)
  if (data instanceof ResponseError) {
    if (data.code === 404) return null
    throw data
  }
  if (data && typeof data === 'object' && 'message' in data && !('docker_compose_yml' in data)) {
    return null
  }
  return data as TenantStackArtifacts
}

export function useTenantDataPlaneStackQuery(ref: string | undefined) {
  return useQuery({
    queryKey: tenantDataPlaneKeys.stack(ref),
    queryFn: () => fetchTenantStack(ref!),
    enabled: Boolean(ref),
    staleTime: 30_000,
  })
}
