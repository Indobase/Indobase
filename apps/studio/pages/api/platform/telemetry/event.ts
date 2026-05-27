import type { NextApiRequest, NextApiResponse } from 'next'
import type { components } from 'api-types'

import apiWrapper, { isResponseOk } from 'lib/api/apiWrapper'
import { apiAuthenticate } from 'lib/api/apiAuthenticate'
import { capturePostHogEvent, getPostHogServer } from 'lib/posthog-server'

type TelemetryEventBody = components['schemas']['TelemetryEventBodyV2']

export default (req: NextApiRequest, res: NextApiResponse) =>
  apiWrapper(req, res, handler, { withAuth: false })

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { method } = req

  switch (method) {
    case 'POST':
      return handlePost(req, res)
    default:
      res.setHeader('Allow', ['POST'])
      res.status(405).json({ data: null, error: { message: `Method ${method} Not Allowed` } })
  }
}

async function handlePost(req: NextApiRequest, res: NextApiResponse) {
  if (!getPostHogServer()) {
    return res.status(200).json({})
  }

  const body = req.body as TelemetryEventBody
  if (!body?.action) {
    return res.status(400).json({ error: { message: 'action is required' } })
  }

  let distinctId = 'anonymous'
  const auth = await apiAuthenticate(req, res)
  if (isResponseOk(auth)) {
    distinctId = auth.sub
  }

  await capturePostHogEvent(distinctId, body.action, {
    ...body.custom_properties,
    page_title: body.page_title,
    page_url: body.page_url,
    pathname: body.pathname,
    ...body.ph,
    ...(body.groups && { $groups: body.groups }),
  })

  return res.status(200).json({})
}
