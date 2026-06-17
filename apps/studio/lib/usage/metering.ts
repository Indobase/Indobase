import type { OrgUsageResponse } from 'data/usage/org-usage-query'

export type OrgUsageWithMetering = OrgUsageResponse

/** True when the platform returned real usage rows (Vector → saas.usage_events). */
export function isOrgUsageMeteringAvailable(usage: OrgUsageWithMetering | undefined): boolean {
  return Boolean(usage?.metering_available && (usage.usages?.length ?? 0) > 0)
}
