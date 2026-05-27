import type { NextApiRequest, NextApiResponse } from 'next'

import apiWrapper, { isResponseOk } from 'lib/api/apiWrapper'
import { apiAuthenticate } from 'lib/api/apiAuthenticate'
import { setNoStore } from 'lib/api/no-store'
import { defaultFeatureFlagsResponse } from 'lib/api/saas/platform-stubs'
import { getPostHogFeatureFlags, getPostHogServer } from 'lib/posthog-server'

export default (req: NextApiRequest, res: NextApiResponse) =>
  apiWrapper(req, res, handler, { withAuth: false })

async function handler(req: NextApiRequest, res: NextApiResponse) {
  setNoStore(res)
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET'])
    return res.status(405).json({ message: 'Method not allowed' })
  }

  const defaults = defaultFeatureFlagsResponse()

  if (!getPostHogServer()) {
    return res.status(200).json(defaults)
  }

  let distinctId = 'anonymous'
  const auth = await apiAuthenticate(req, res)
  if (isResponseOk(auth)) {
    distinctId = auth.sub
  }

  const organizationSlug =
    typeof req.query.organization_slug === 'string' ? req.query.organization_slug : undefined
  const projectRef = typeof req.query.project_ref === 'string' ? req.query.project_ref : undefined

  const groups: Record<string, string> = {}
  if (organizationSlug) groups.organization = organizationSlug
  if (projectRef) groups.project = projectRef

  const liveFlags = await getPostHogFeatureFlags(distinctId, {
    groups: Object.keys(groups).length > 0 ? groups : undefined,
  })

  return res.status(200).json({
    ...defaults,
    ...liveFlags,
  })
}
