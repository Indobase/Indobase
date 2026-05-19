import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { constructHeaders, handleError } from 'data/fetchers'
import { API_URL } from 'lib/constants'
import type { ResponseError, UseCustomMutationOptions } from 'types'

async function adminDeleteRequest(url: string) {
  const headers = await constructHeaders()
  const response = await fetch(url, {
    method: 'DELETE',
    headers,
    credentials: 'include',
    referrerPolicy: 'no-referrer-when-downgrade',
  })

  if (!response.ok) {
    let message = `Request failed (${response.status})`
    try {
      const body = await response.json()
      if (body?.message) message = body.message
    } catch {
      // ignore
    }
    throw new ResponseError(message, response.status)
  }

  return response.json().catch(() => ({ ok: true }))
}

export async function deletePlatformAdminOrganization({ slug }: { slug: string }) {
  const url = `${API_URL}/platform/admin/organizations?slug=${encodeURIComponent(slug)}`
  try {
    return await adminDeleteRequest(url)
  } catch (error) {
    if (error instanceof ResponseError) throw error
    handleError(error)
  }
}

export async function deletePlatformAdminProject({ ref }: { ref: string }) {
  const url = `${API_URL}/platform/admin/projects?ref=${encodeURIComponent(ref)}`
  try {
    return await adminDeleteRequest(url)
  } catch (error) {
    if (error instanceof ResponseError) throw error
    handleError(error)
  }
}

export async function deletePlatformAdminUser({ gotrueId }: { gotrueId: string }) {
  const url = `${API_URL}/platform/admin/users?gotrue_id=${encodeURIComponent(gotrueId)}`
  try {
    return await adminDeleteRequest(url)
  } catch (error) {
    if (error instanceof ResponseError) throw error
    handleError(error)
  }
}

function invalidateAdminLists(queryClient: ReturnType<typeof useQueryClient>) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: ['platform-admin', 'overview'] }),
    queryClient.invalidateQueries({ queryKey: ['platform-admin', 'organizations'] }),
    queryClient.invalidateQueries({ queryKey: ['platform-admin', 'organization'] }),
    queryClient.invalidateQueries({ queryKey: ['platform-admin', 'projects'] }),
    queryClient.invalidateQueries({ queryKey: ['platform-admin', 'users'] }),
    queryClient.invalidateQueries({ queryKey: ['platform-admin', 'audit-logs'] }),
    queryClient.invalidateQueries({ queryKey: ['platform-admin', 'usage'] }),
    queryClient.invalidateQueries({ queryKey: ['platform-admin', 'problems'] }),
  ])
}

export const usePlatformAdminOrganizationDeleteMutation = (
  options: Omit<
    UseCustomMutationOptions<unknown, ResponseError, { slug: string }>,
    'mutationFn'
  > = {}
) => {
  const queryClient = useQueryClient()
  const { onSuccess, onError, ...rest } = options

  return useMutation({
    mutationFn: deletePlatformAdminOrganization,
    async onSuccess(data, variables, context) {
      await invalidateAdminLists(queryClient)
      toast.success('Organization deleted')
      await onSuccess?.(data, variables, context)
    },
    async onError(error, variables, context) {
      if (onError === undefined) {
        toast.error(`Failed to delete organization: ${error.message}`)
      } else {
        onError(error, variables, context)
      }
    },
    ...rest,
  })
}

export const usePlatformAdminProjectDeleteMutation = (
  options: Omit<UseCustomMutationOptions<unknown, ResponseError, { ref: string }>, 'mutationFn'> = {}
) => {
  const queryClient = useQueryClient()
  const { onSuccess, onError, ...rest } = options

  return useMutation({
    mutationFn: deletePlatformAdminProject,
    async onSuccess(data, variables, context) {
      await invalidateAdminLists(queryClient)
      toast.success('Project deleted')
      await onSuccess?.(data, variables, context)
    },
    async onError(error, variables, context) {
      if (onError === undefined) {
        toast.error(`Failed to delete project: ${error.message}`)
      } else {
        onError(error, variables, context)
      }
    },
    ...rest,
  })
}

export const usePlatformAdminUserDeleteMutation = (
  options: Omit<
    UseCustomMutationOptions<unknown, ResponseError, { gotrueId: string }>,
    'mutationFn'
  > = {}
) => {
  const queryClient = useQueryClient()
  const { onSuccess, onError, ...rest } = options

  return useMutation({
    mutationFn: deletePlatformAdminUser,
    async onSuccess(data, variables, context) {
      await invalidateAdminLists(queryClient)
      toast.success('User deleted')
      await onSuccess?.(data, variables, context)
    },
    async onError(error, variables, context) {
      if (onError === undefined) {
        toast.error(`Failed to delete user: ${error.message}`)
      } else {
        onError(error, variables, context)
      }
    },
    ...rest,
  })
}
