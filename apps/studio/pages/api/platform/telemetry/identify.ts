import type { NextApiRequest, NextApiResponse } from 'next'
import type { components } from 'api-types'

import apiWrapper, { isResponseOk } from 'lib/api/apiWrapper'
import { apiAuthenticate } from 'lib/api/apiAuthenticate'
import { setNoStore } from 'lib/api/no-store'
import { identifyPostHogGroups, getPostHogServer } from 'lib/posthog-server'

type IdentifyBody = components['schemas']['TelemetryIdentifyBodyV2'] & {
  organization_slug?: string
  project_ref?: string
}

export default (req: NextApiRequest, res: NextApiResponse) =>
  apiWrapper(req, res, handler, { withAuth: false })

async function handler(req: NextApiRequest, res: NextApiResponse) {
  setNoStore(res)
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST'])
    return res.status(405).json({ message: 'Method not allowed' })
  }

  if (!getPostHogServer()) {
    return res.status(200).json({})
  }

  const body = req.body as IdentifyBody
  const auth = await apiAuthenticate(req, res)
  const distinctId = isResponseOk(auth) ? auth.sub : body.user_id

  if (!distinctId) {
    return res.status(400).json({ message: 'user_id or auth required' })
  }

  await identifyPostHogGroups(distinctId, {
    organizationSlug: body.organization_slug,
    projectRef: body.project_ref,
  })

  return res.status(200).json({})
}
