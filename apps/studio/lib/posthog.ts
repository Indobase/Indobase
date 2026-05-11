import { components } from 'api-types'
import { hasConsented } from 'common'

type TrackFeatureFlagVariables = components['schemas']['TelemetryFeatureFlagBody']

/** Hosted Supabase Platform telemetry removed; Indobase SaaS uses other analytics when configured. */
export async function trackFeatureFlag(_body: TrackFeatureFlagVariables) {
  if (!hasConsented()) return undefined
  return undefined
}
