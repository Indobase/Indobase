import { NextApiRequest, NextApiResponse } from 'next'

import apiWrapper from 'lib/api/apiWrapper'

export default (req: NextApiRequest, res: NextApiResponse) =>
  apiWrapper(req, res, handler, { withAuth: true })

// Per-tenant data-plane provisioning is not used in Model A (single Postgres
// + RLS). All tenants share the same data plane (Kong/Auth/Storage/Postgres),
// so there is nothing to provision per project. Return 404 instead of 500 so
// callers can detect "feature not available" cleanly.
async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Allow', ['POST'])
  return res.status(404).json({
    message:
      'Per-project data-plane provisioning is not available in single-DB RLS mode (Model A). All tenants share the same data plane.',
  })
}
