import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import type { IndobasePlatform } from '@indobaseinc/mcp-server'
import { stripIndent } from 'common-tags'
import { commaSeparatedStringIntoArray, fromNodeHeaders, zBooleanString } from 'lib/api/apiHelpers'
import {
  readBearerToken,
  verifyBuilderMcpToken,
  builderMcpClaimsToJwtPayload,
} from 'lib/api/saas/builder-mcp-auth'
import {
  getAccountOperations,
  getDatabaseOperations,
  getDebuggingOperations,
  getDevelopmentOperations,
} from 'lib/api/saas/mcp'
import { withIndobaseMcpBranding } from 'lib/api/mcp-branding'
import { DEFAULT_PROJECT } from 'lib/constants/api'
import { getUserClaims } from 'lib/gotrue'
import { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'

const supportedFeatureGroupSchema = z.enum([
  'docs',
  'account',
  'database',
  'development',
  'debugging',
  'functions',
  'branching',
  'storage',
])

const mcpQuerySchema = z.object({
  features: z
    .string()
    .transform(commaSeparatedStringIntoArray)
    .optional()
    .describe(
      stripIndent`
        A comma-separated list of feature groups to filter tools by. If not provided, all tools are available.

        The following feature groups are supported: ${supportedFeatureGroupSchema.options.map((group) => `\`${group}\``).join(', ')}.
      `
    )
    .pipe(z.array(supportedFeatureGroupSchema).optional()),
  project_ref: z.string().min(1).optional(),
  read_only: zBooleanString()
    .default('false')
    .describe(
      'Indicates whether or not the MCP server should operate in read-only mode. This prevents write operations on any of your databases by executing SQL as a read-only Postgres user.'
    ),
  readonly: zBooleanString().optional(),
})

async function resolveMcpRequestAuth(req: NextApiRequest, requestedProjectRef?: string) {
  const token = readBearerToken(req.headers.authorization)

  if (!token) {
    return {
      authType: 'none' as const,
      claims: undefined,
      projectRef: requestedProjectRef,
    }
  }

  try {
    const builderClaims = verifyBuilderMcpToken(token)
    const tokenProjectRef = builderClaims.project_ref

    if (requestedProjectRef && requestedProjectRef !== tokenProjectRef) {
      throw new Error('Builder MCP token project mismatch')
    }

    return {
      authType: 'builder' as const,
      claims: builderClaims,
      projectRef: tokenProjectRef,
    }
  } catch (builderError) {
    const { claims, error } = await getUserClaims(token)

    if (!claims || error) {
      throw builderError instanceof Error ? builderError : new Error('Invalid MCP authorization token')
    }

    return {
      authType: 'user' as const,
      claims,
      projectRef: requestedProjectRef,
    }
  }
}

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  switch (req.method) {
    case 'POST':
      return handlePost(req, res)
    default:
      res.setHeader('Allow', ['POST'])
      return res.status(405).json({ error: { message: `Method ${req.method} Not Allowed` } })
  }
}

async function handlePost(req: NextApiRequest, res: NextApiResponse) {
  const { error, data } = mcpQuerySchema.safeParse(req.query)

  if (error) {
    return res.status(400).json({ error: error.flatten().fieldErrors })
  }

  const { features, project_ref, read_only, readonly } = data
  const readOnly = read_only ?? readonly ?? false

  let auth
  try {
    auth = await resolveMcpRequestAuth(req, project_ref)
  } catch (authError) {
    const message = authError instanceof Error ? authError.message : 'Unauthorized'
    // MCP clients expect JSON-RPC envelopes, not `{ error: string }`.
    return res.status(401).json({
      jsonrpc: '2.0',
      error: { code: -32001, message },
      id: null,
    })
  }

  const headers = fromNodeHeaders(req.headers)

  if (auth.authType === 'builder') {
    headers.delete('authorization')
  }

  const resolvedProjectRef = auth.projectRef ?? DEFAULT_PROJECT.ref
  const userClaims =
    auth.authType === 'user'
      ? auth.claims
      : auth.authType === 'builder'
        ? builderMcpClaimsToJwtPayload(auth.claims)
        : undefined

  const platform: IndobasePlatform = {
    account: userClaims ? getAccountOperations({ claims: userClaims }) : undefined,
    database: getDatabaseOperations({
      headers,
      claims: userClaims,
      projectRef: resolvedProjectRef,
    }),
    development: getDevelopmentOperations({
      headers,
      claims: userClaims,
      projectRef: resolvedProjectRef,
    }),
    debugging: getDebuggingOperations({
      headers,
      claims: userClaims,
      projectRef: resolvedProjectRef,
    }),
  }

  try {
    const { createIndobaseMcpServer } = await import('@indobaseinc/mcp-server')
    const server = createIndobaseMcpServer({
      platform,
      projectId: resolvedProjectRef,
      features,
      readOnly,
    })

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    })

    await server.connect(transport)
    await transport.handleRequest(req, withIndobaseMcpBranding(res), req.body)
  } catch (error) {
    if (error instanceof Error) {
      return res.status(400).json({
        jsonrpc: '2.0',
        error: { code: -32000, message: error.message },
        id: null,
      })
    }

    return res.status(500).json({
      jsonrpc: '2.0',
      error: { code: -32603, message: 'Unable to process MCP request' },
      id: null,
    })
  }
}

export default handler
