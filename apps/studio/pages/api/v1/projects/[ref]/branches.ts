import type { JwtPayload } from '@supabase/supabase-js'
import type { NextApiRequest, NextApiResponse } from 'next'

import apiWrapper from 'lib/api/apiWrapper'

// Database branching requires a separate Postgres instance per branch.
// Indobase self-hosted (Model A: single DB + RLS) does not support that
// isolation model, so we always report the feature as unavailable.
//
// We use the exact error message the Studio data layer recognizes
// (`branches-query.ts`) so the UI gracefully renders an empty list.

export default (req: NextApiRequest, res: NextApiResponse) =>
  apiWrapper(req, res, handler, { withAuth: true })

async function handler(req: NextApiRequest, res: NextApiResponse, _claims?: JwtPayload) {
  switch (req.method) {
    case 'GET':
    case 'POST':
    case 'DELETE':
    case 'PATCH':
      return res.status(422).json({
        message: 'Preview branching is not enabled for this project.',
        reason:
          'Indobase self-hosted runs in single-DB RLS mode (Model A). Database branching ' +
          'requires per-branch Postgres instances which are not provisioned in this deployment.',
      })
    default: {
      res.setHeader('Allow', ['GET', 'POST', 'DELETE', 'PATCH'])
      return res.status(405).json({ message: `Method ${req.method} Not Allowed` })
    }
  }
}
