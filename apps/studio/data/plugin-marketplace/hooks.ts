import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import type {
  PluginCategory,
  PluginDetail,
  PluginInstallResult,
  PluginListing,
} from './types'

const keys = {
  categories: ['plugin-marketplace', 'categories'] as const,
  marketplace: (search?: string, category?: string) =>
    ['plugin-marketplace', 'list', search ?? '', category ?? ''] as const,
  org: (slug?: string) => ['plugin-marketplace', 'org', slug ?? ''] as const,
  detail: (slug?: string) => ['plugin-marketplace', 'detail', slug ?? ''] as const,
  admin: ['plugin-marketplace', 'admin'] as const,
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    ...init,
  })

  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(payload?.message || `Request failed (${response.status})`)
  }
  return payload as T
}

export const usePluginCategoriesQuery = () =>
  useQuery({
    queryKey: keys.categories,
    queryFn: () => fetchJson<PluginCategory[]>('/api/platform/plugins/categories'),
  })

export const useMarketplacePluginsQuery = (params: { search?: string; category?: string }) =>
  useQuery({
    queryKey: keys.marketplace(params.search, params.category),
    queryFn: () => {
      const searchParams = new URLSearchParams()
      if (params.search) searchParams.set('search', params.search)
      if (params.category) searchParams.set('category', params.category)
      const suffix = searchParams.toString()
      return fetchJson<PluginListing[]>(`/api/platform/plugins${suffix ? `?${suffix}` : ''}`)
    },
  })

export const useOrganizationPluginsQuery = (slug?: string) =>
  useQuery({
    queryKey: keys.org(slug),
    queryFn: () => fetchJson<PluginListing[]>(`/api/platform/organizations/${slug}/plugins`),
    enabled: Boolean(slug),
  })

export const usePluginDetailQuery = (slug?: string) =>
  useQuery({
    queryKey: keys.detail(slug),
    queryFn: () => fetchJson<PluginDetail>(`/api/platform/plugins/${slug}`),
    enabled: Boolean(slug),
  })

export const useAdminPluginReviewQueueQuery = () =>
  useQuery({
    queryKey: keys.admin,
    queryFn: () => fetchJson<PluginListing[]>('/api/platform/admin/plugins'),
  })

export const useCreateOrganizationPluginMutation = (organizationSlug?: string) => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      fetchJson<PluginDetail>(`/api/platform/organizations/${organizationSlug}/plugins`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: async () => {
      toast.success('Plugin listing published as draft')
      await queryClient.invalidateQueries({ queryKey: keys.org(organizationSlug) })
      await queryClient.invalidateQueries({ queryKey: keys.marketplace('', '') })
    },
    onError: (error) => toast.error(error.message),
  })
}

export const useUpdateOrganizationPluginMutation = (
  organizationSlug?: string,
  pluginSlug?: string
) => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      fetchJson<PluginDetail>(
        `/api/platform/organizations/${organizationSlug}/plugins/${pluginSlug}`,
        {
          method: 'PATCH',
          body: JSON.stringify(body),
        }
      ),
    onSuccess: async () => {
      toast.success('Plugin listing updated')
      await queryClient.invalidateQueries({ queryKey: keys.org(organizationSlug) })
      await queryClient.invalidateQueries({ queryKey: keys.detail(pluginSlug) })
      await queryClient.invalidateQueries({ queryKey: keys.marketplace('', '') })
    },
    onError: (error) => toast.error(error.message),
  })
}

export const useCreatePluginVersionMutation = (
  organizationSlug?: string,
  pluginSlug?: string
) => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      fetchJson<PluginDetail>(
        `/api/platform/organizations/${organizationSlug}/plugins/${pluginSlug}/versions`,
        {
          method: 'POST',
          body: JSON.stringify(body),
        }
      ),
    onSuccess: async () => {
      toast.success('Plugin version created')
      await queryClient.invalidateQueries({ queryKey: keys.org(organizationSlug) })
      await queryClient.invalidateQueries({ queryKey: keys.detail(pluginSlug) })
      await queryClient.invalidateQueries({ queryKey: keys.admin })
    },
    onError: (error) => toast.error(error.message),
  })
}

export const useReviewPluginMutation = (pluginSlug?: string) => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      fetchJson<PluginDetail>(`/api/platform/plugins/${pluginSlug}/review`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: async () => {
      toast.success('Review decision saved')
      await queryClient.invalidateQueries({ queryKey: keys.admin })
      await queryClient.invalidateQueries({ queryKey: keys.detail(pluginSlug) })
      await queryClient.invalidateQueries({ queryKey: keys.marketplace('', '') })
    },
    onError: (error) => toast.error(error.message),
  })
}

export const useInstallPluginMutation = (pluginSlug?: string) => {
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      fetchJson<PluginInstallResult>(`/api/platform/plugins/${pluginSlug}/install`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onError: (error) => toast.error(error.message),
  })
}
