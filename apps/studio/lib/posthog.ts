import { components } from 'api-types'
import {
  hasConsented,
  isPostHogConfigured,
  posthogClient,
  trackFeatureFlag as trackFeatureFlagApi,
} from 'common'

import { API_URL } from 'lib/constants'

type TrackFeatureFlagVariables = components['schemas']['TelemetryFeatureFlagBody']

export async function trackFeatureFlag(body: TrackFeatureFlagVariables) {
  if (!hasConsented()) return undefined

  if (isPostHogConfigured()) {
    posthogClient.captureFeatureFlagCall(
      body.feature_flag_name,
      body.feature_flag_value,
      true
    )
    return undefined
  }

  if (API_URL) {
    await trackFeatureFlagApi(API_URL, body)
  }

  return undefined
}
