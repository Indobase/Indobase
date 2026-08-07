import type { ExecutionId } from '../ids'
import type { BusinessLaunchStage } from './BusinessLaunchPipeline'

/**
 * Customer-facing launch outcome — never expose deploy/provisioner jargon.
 * Wire APIs may map `live` → `published` for bridge compatibility.
 */

export type BusinessLaunchStatus = 'queued' | 'live' | 'failed'

export type BusinessLaunchErrorCode =
  | 'PLAN_FAILED'
  | 'CAPABILITY_ENSURE_FAILED'
  | 'PUBLISH_FAILED'
  | 'CONFIGURE_FAILED'
  | 'VERIFY_FAILED'
  | 'OPERATOR_FAILED'
  | 'UNKNOWN'

export type BusinessLaunchSuccess = {
  ok: true
  liveUrl: string
  status: Exclude<BusinessLaunchStatus, 'failed'>
  message: string
  stage: BusinessLaunchStage
  executionId?: ExecutionId | string
}

export type BusinessLaunchFailure = {
  ok: false
  status: 'failed'
  message: string
  stage: BusinessLaunchStage
  errorCode: BusinessLaunchErrorCode
  executionId?: ExecutionId | string
  /**
   * Present when Publish already reserved hosting (e.g. VERIFY_FAILED) —
   * hosting is not torn down; os_publish may be stamped `verify_failed`.
   */
  liveUrl?: string
}

export type BusinessLaunchResult = BusinessLaunchSuccess | BusinessLaunchFailure

export const BUSINESS_LIVE_MESSAGE = 'Your business is now live'
export const BUSINESS_QUEUED_MESSAGE =
  "We're finishing your business setup. Your live link is reserved."
export const BUSINESS_FAILED_MESSAGE =
  'We could not launch your business right now. Please try again.'
export const BUSINESS_VERIFY_FAILED_MESSAGE =
  "We couldn't confirm your business is responding yet. Your live link is reserved — please try Launch again in a moment."

export function businessLaunchSucceeded(
  input: Omit<BusinessLaunchSuccess, 'ok' | 'message'> & { message?: string },
): BusinessLaunchSuccess {
  const message =
    input.message ??
    (input.status === 'queued' ? BUSINESS_QUEUED_MESSAGE : BUSINESS_LIVE_MESSAGE)
  return {
    ok: true,
    liveUrl: input.liveUrl,
    status: input.status,
    message,
    stage: input.stage,
    executionId: input.executionId,
  }
}

export function businessLaunchFailed(
  input: Omit<BusinessLaunchFailure, 'ok' | 'status' | 'message'> & { message?: string },
): BusinessLaunchFailure {
  return {
    ok: false,
    status: 'failed',
    message: input.message ?? BUSINESS_FAILED_MESSAGE,
    stage: input.stage,
    errorCode: input.errorCode,
    executionId: input.executionId,
    liveUrl: input.liveUrl,
  }
}

/** Map kernel result → OS API `{ ok, url?, status, message? }` (bridge-compatible). */
export function toOsLaunchResponse(result: BusinessLaunchResult): {
  ok: boolean
  url?: string
  status: 'queued' | 'published' | 'failed'
  message?: string
} {
  if (!result.ok) {
    return {
      ok: false,
      status: 'failed',
      message: result.message,
      ...(result.liveUrl ? { url: result.liveUrl } : {}),
    }
  }

  return {
    ok: true,
    url: result.liveUrl,
    status: result.status === 'live' ? 'published' : 'queued',
    message: result.message,
  }
}
