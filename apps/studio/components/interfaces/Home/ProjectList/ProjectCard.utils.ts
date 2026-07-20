import { PROJECT_STATUS } from 'lib/constants'

export const inferProjectStatus = (projectStatus: string) => {
  let status = undefined
  switch (projectStatus) {
    case PROJECT_STATUS.ACTIVE_HEALTHY:
      status = 'isHealthy'
      break
    case PROJECT_STATUS.GOING_DOWN:
    case PROJECT_STATUS.PAUSING:
      status = 'isPausing'
      break
    case PROJECT_STATUS.INACTIVE:
      status = 'isPaused'
      break
    case PROJECT_STATUS.PAUSE_FAILED:
      status = 'isPauseFailed'
      break
    case PROJECT_STATUS.RESTARTING:
      status = 'isRestarting'
      break
    case PROJECT_STATUS.RESIZING:
      status = 'isResizing'
      break
    case PROJECT_STATUS.RESTORING:
      status = 'isRestoring'
      break
    case PROJECT_STATUS.RESTORE_FAILED:
      status = 'isRestoreFailed'
      break
    case PROJECT_STATUS.UPGRADING:
      status = 'isUpgrading'
      break
    case PROJECT_STATUS.UNKNOWN:
    case PROJECT_STATUS.COMING_UP:
      status = 'isComingUp'
      break
  }
  return status as InferredProjectStatus
}

export const getProjectLocationLabel = (region?: string | null) => {
  const normalizedRegion = region?.trim()
  if (!normalizedRegion) return undefined

  // Keep the useful location while stripping vendor-prefixed labels from older data.
  return normalizedRegion.replace(/^(aws|fly)\s*[|:-]?\s*/i, '').trim() || undefined
}

export type InferredProjectStatus =
  | 'isHealthy'
  | 'isPausing'
  | 'isPaused'
  | 'isPauseFailed'
  | 'isRestarting'
  | 'isResizing'
  | 'isRestoring'
  | 'isRestoreFailed'
  | 'isComingUp'
  | 'isUpgrading'
  | undefined
