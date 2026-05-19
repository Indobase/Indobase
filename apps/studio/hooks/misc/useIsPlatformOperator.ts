import { usePlatformOperatorQuery } from 'data/platform-admin/platform-admin-query'
import { IS_SAAS } from 'lib/constants'

export function useIsPlatformOperator() {
  const { data, isPending, isError } = usePlatformOperatorQuery({
    enabled: IS_SAAS,
  })

  return {
    isPlatformOperator: Boolean(data?.is_platform_operator),
    isLoading: IS_SAAS ? isPending : false,
    isError,
  }
}
