import type { ProjectServiceStatus } from 'components/interfaces/Home/ServiceStatus'

type ServiceRow = {
  name: string
  status: ProjectServiceStatus
  error?: string
  isLoading?: boolean
}

export function formatServiceStatusMessage(
  status: ProjectServiceStatus | undefined,
  opts?: { isLoading?: boolean; isProjectNew?: boolean; error?: string }
): string {
  if (opts?.isLoading) return 'Checking status'
  if (status === 'DISABLED') return 'Disabled'
  if (status === 'UNHEALTHY') {
    const detail = opts?.error?.trim()
    return detail ? `Unhealthy — ${detail}` : 'Unhealthy'
  }
  if (status === 'COMING_UP') return 'Coming up...'
  if (status === 'ACTIVE_HEALTHY') return 'Healthy'
  if (opts?.isProjectNew) return 'Coming up...'
  if (status) return status
  return 'Unable to connect'
}

/** Human label for the status chip — lists degraded services instead of opaque "Unhealthy". */
export function formatOverallServiceStatusLabel(services: ServiceRow[]): string {
  const isLoadingChecks = services.some((s) => s.isLoading)
  if (isLoadingChecks) return 'Checking...'

  const comingUp = services.filter((s) => s.status === 'COMING_UP')
  if (comingUp.length > 0) {
    if (comingUp.length === 1) return `${comingUp[0].name} starting`
    return `${comingUp.length} services starting`
  }

  const unhealthy = services.filter((s) => s.status === 'UNHEALTHY')
  if (unhealthy.length > 0) {
    if (unhealthy.length === 1) return `${unhealthy[0].name} unhealthy`
    const names = unhealthy.map((s) => s.name).join(', ')
    return `${unhealthy.length} degraded: ${names}`
  }

  return 'Healthy'
}
