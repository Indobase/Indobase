import { useParams } from 'common'
import { IS_SAAS } from 'lib/constants'
import { useMemo } from 'react'
import { FEATURE_GROUPS_NON_PLATFORM, FEATURE_GROUPS_PLATFORM, getMcpUrl } from 'ui-patterns/McpUrlBuilder'

import { StepContentProps } from './Connect.types'

export function useMcpUrl(
  state: StepContentProps['state'],
  projectKeys: StepContentProps['projectKeys']
): string {
  const { ref: projectRef } = useParams()
  const readonly = Boolean(state.mcpReadonly)

  return useMemo(() => {
    const selectedFeatures = Array.isArray(state.mcpFeatures) ? state.mcpFeatures : []
    const supportedFeatures = IS_SAAS ? FEATURE_GROUPS_PLATFORM : FEATURE_GROUPS_NON_PLATFORM
    const validFeatures = selectedFeatures.filter((f) =>
      supportedFeatures.some((group) => group.id === f)
    )

    return getMcpUrl({
      projectRef: typeof projectRef === 'string' ? projectRef : undefined,
      isPlatform: IS_SAAS,
      apiUrl: projectKeys.apiUrl ?? undefined,
      readonly,
      features: validFeatures,
    }).mcpUrl
  }, [projectRef, projectKeys.apiUrl, readonly, state.mcpFeatures])
}
