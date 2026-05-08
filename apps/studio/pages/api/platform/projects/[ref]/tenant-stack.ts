import { NextApiRequest, NextApiResponse } from 'next'

import apiWrapper from 'lib/api/apiWrapper'

export default (req: NextApiRequest, res: NextApiResponse) =>
  apiWrapper(req, res, handler, { withAuth: true })

// Per-tenant data-plane stacks are not used in Model A (single Postgres + RLS).
// This endpoint used to return the rendered docker-compose / Traefik artifacts
// for an isolated tenant stack; in single-DB RLS mode tenants share the data
// plane, so it has no meaningful payload to return. Reply 404 instead of
// throwing 500 so the UI degrades gracefully.
async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Allow', ['GET'])
  return res.status(404).json({
    message:
      'Tenant stack artifacts are not available in single-DB RLS mode (Model A). All tenants share the same data plane.',
  })
}

