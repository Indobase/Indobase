import { useOrgUsageQuery } from 'data/usage/org-usage-query'
import { IS_SAAS } from 'lib/constants'
import { isOrgUsageMeteringAvailable } from 'lib/usage/metering'

export function useOrgUsageMeteringAvailable(orgSlug?: string) {
  const { data, isPending, isSuccess } = useOrgUsageQuery(
    { orgSlug },
    { enabled: IS_SAAS && Boolean(orgSlug) }
  )

  return {
    isMeteringAvailable: isOrgUsageMeteringAvailable(data),
    isLoading: isPending,
    isReady: isSuccess,
  }
}
