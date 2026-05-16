import type { components } from 'api-types'

import { INDIA_REGIONS, INDIA_REGION_DEFAULT } from 'lib/constants/india-regions'

type RegionsInfo = components['schemas']['RegionsInfo']

/** Region list for SaaS project creation (smart + specific selectors). */
export function buildIndiaRegionsInfo(
  cloudProvider: 'AWS' | 'FLY' | 'AWS_K8S' | 'AWS_NIMBUS'
): RegionsInfo {
  const specific = Object.values(INDIA_REGIONS).map((region) => ({
    code: region.code as RegionsInfo['all']['specific'][number]['code'],
    name: region.displayName,
    provider: cloudProvider,
    type: 'specific' as const,
  }))

  const smartGroup = [
    {
      code: 'apac' as const,
      name: 'India',
      type: 'smartGroup' as const,
    },
  ]

  const recommendedSpecific = specific.find((r) => r.code === INDIA_REGION_DEFAULT.code) ?? specific[0]

  return {
    all: { smartGroup, specific },
    recommendations: {
      smartGroup: smartGroup[0],
      specific: recommendedSpecific ? [recommendedSpecific] : [],
    },
  } as RegionsInfo
}
