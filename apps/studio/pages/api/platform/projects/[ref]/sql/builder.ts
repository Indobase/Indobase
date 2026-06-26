import type { NextApiRequest, NextApiResponse } from 'next'

import {
  builderMcpClaimsToJwtPayload,
  readBearerToken,
  verifyBuilderMcpToken,
} from 'lib/api/saas/builder-mcp-auth'
import { getDatabaseOperations } from 'lib/api/saas/mcp'
import { setNoStore } from 'lib/api/no-store'

type BuilderSqlBody = {
  name?: string
  operation?: 'query' | 'migration'
  query: string
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  setNoStore(res)

  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST'])
    return res.status(405).json({ message: `Method ${req.method} Not Allowed` })
  }

  const ref = typeof req.query.ref === 'string' ? req.query.ref.trim() : ''
  if (!ref) {
    return res.status(400).json({ message: 'Project ref is required' })
  }

  const token = readBearerToken(req.headers.authorization)
  if (!token) {
    return res.status(401).json({ message: 'Builder authorization token is required' })
  }

  let builderClaims
  try {
    builderClaims = verifyBuilderMcpToken(token)
  } catch (error) {
    return res.status(401).json({
      message: error instanceof Error ? error.message : 'Invalid Builder authorization token',
    })
  }

  if (builderClaims.project_ref !== ref) {
    return res.status(403).json({ message: 'Builder token does not match this project' })
  }

  const body = (req.body || {}) as BuilderSqlBody
  const query = typeof body.query === 'string' ? body.query.trim() : ''

  if (!query) {
    return res.status(400).json({ message: 'SQL query is required' })
  }

  const claims = builderMcpClaimsToJwtPayload(builderClaims)
  const database = getDatabaseOperations({ claims, projectRef: ref })

  try {
    if (body.operation === 'migration') {
      const name =
        body.name?.trim() ||
        `builder_${new Date().toISOString().replace(/[:.]/g, '-')}`

      await database.applyMigration(ref, { query, name })
      return res.status(200).json({ success: true, name })
    }

    const data = await database.executeSql(ref, { query, read_only: false })
    return res.status(200).json({ data })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'SQL execution failed'
    return res.status(400).json({ message })
  }
}
