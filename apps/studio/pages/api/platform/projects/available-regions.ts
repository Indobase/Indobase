import type { components } from 'api-types'
import type { NextApiRequest, NextApiResponse } from 'next'

import apiWrapper from 'lib/api/apiWrapper'
import { setNoStore } from 'lib/api/no-store'
import { AWS_REGIONS_DEFAULT } from 'lib/constants/infrastructure'
import { AWS_REGIONS } from 'shared-data'

type RegionsInfo = components['schemas']['RegionsInfo']

function buildLocalRegionsInfo(
  cloudProvider: 'AWS' | 'FLY' | 'AWS_K8S' | 'AWS_NIMBUS'
): RegionsInfo {
  const defaultRegion = AWS_REGIONS_DEFAULT
  const specific = Object.values(AWS_REGIONS).map((region) => ({
    code: region.code as RegionsInfo['all']['specific'][number]['code'],
    name: region.displayName,
    provider: cloudProvider,
    type: 'specific' as const,
  }))

  const smartGroup = [
    {
      code: 'apac' as const,
      name: 'Asia-Pacific',
      type: 'smartGroup' as const,
    },
    {
      code: 'americas' as const,
      name: 'Americas',
      type: 'smartGroup' as const,
    },
    {
      code: 'emea' as const,
      name: 'Europe, Middle East & Africa',
      type: 'smartGroup' as const,
    },
  ]

  const recommendedSpecific = specific.find((r) => r.code === defaultRegion.code) ?? specific[0]

  return {
    all: { smartGroup, specific },
    recommendations: {
      smartGroup: {
        code: 'apac',
        name: 'Asia-Pacific',
        type: 'smartGroup',
      },
      specific: recommendedSpecific ? [recommendedSpecific] : [],
    },
  }
}

export default (req: NextApiRequest, res: NextApiResponse) =>
  apiWrapper(req, res, handler, { withAuth: true })

async function handler(req: NextApiRequest, res: NextApiResponse) {
  setNoStore(res)

  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET'])
    return res.status(405).json({ message: 'Method not allowed' })
  }

  const cloudProvider = (req.query.cloud_provider as string) || 'AWS'
  if (!['AWS', 'FLY', 'AWS_K8S', 'AWS_NIMBUS'].includes(cloudProvider)) {
    return res.status(400).json({ message: 'Invalid cloud_provider' })
  }

  const organizationSlug = typeof req.query.organization_slug === 'string' ? req.query.organization_slug : ''
  if (!organizationSlug) {
    return res.status(400).json({ message: 'organization_slug is required' })
  }

  return res
    .status(200)
    .json(buildLocalRegionsInfo(cloudProvider as 'AWS' | 'FLY' | 'AWS_K8S' | 'AWS_NIMBUS'))
}
