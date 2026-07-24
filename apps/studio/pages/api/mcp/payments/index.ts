import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { commaSeparatedStringIntoArray, fromNodeHeaders, zBooleanString } from 'lib/api/apiHelpers'
import {
  builderMcpClaimsToJwtPayload,
  readBearerToken,
  verifyBuilderMcpToken,
} from 'lib/api/saas/builder-mcp-auth'
import { withIndobaseMcpBranding } from 'lib/api/mcp-branding'
import { createPaymentsMcpServer } from 'lib/api/saas/payments-mcp-server'
import { createPaymentsApiClient, mintPaymentsMcpBearer } from 'lib/api/saas/payments-mcp'
import { getMerchantCanGoLive } from 'lib/api/saas/merchant-kyc'
import { getUserClaims } from 'lib/gotrue'
import { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'

const mcpQuerySchema = z.object({
  project_ref: z.string().min(1).optional(),
  read_only: zBooleanString().default('false'),
  readonly: zBooleanString().optional(),
  // Reserved for future feature filters; accepted so clients can pass features=payments.
  features: z
    .string()
    .transform(commaSeparatedStringIntoArray)
    .optional()
    .pipe(z.array(z.string()).optional()),
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

  const { project_ref, read_only, readonly } = data
  const readOnly = read_only ?? readonly ?? false

  let auth
  try {
    auth = await resolveMcpRequestAuth(req, project_ref)
  } catch (authError) {
    const message = authError instanceof Error ? authError.message : 'Unauthorized'
    return res.status(401).json({
      jsonrpc: '2.0',
      error: { code: -32001, message },
      id: null,
    })
  }

  if (auth.authType === 'none' || !auth.claims || !auth.projectRef) {
    return res.status(401).json({
      jsonrpc: '2.0',
      error: {
        code: -32001,
        message: 'Payments MCP requires Authorization Bearer and project_ref',
      },
      id: null,
    })
  }

  // Touch headers so future cookie-forwarding stays consistent with /api/mcp.
  fromNodeHeaders(req.headers)

  const userClaims =
    auth.authType === 'user'
      ? auth.claims
      : builderMcpClaimsToJwtPayload(auth.claims)

  try {
    const minted = await mintPaymentsMcpBearer({
      claims: userClaims as never,
      projectRef: auth.projectRef,
    })
    const client = createPaymentsApiClient({
      apiBaseUrl: minted.apiBaseUrl,
      bearerToken: minted.bearerToken,
    })
    const liveChargesAllowed = await getMerchantCanGoLive({
      claims: userClaims as never,
      ref: auth.projectRef,
    })
    const server = createPaymentsMcpServer(client, { readOnly, liveChargesAllowed })

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    })

    await server.connect(transport)
    await transport.handleRequest(
      req,
      withIndobaseMcpBranding(res, {
        name: 'indobase-payments',
        title: 'Indobase Payments',
        version: '1.0.0',
      }),
      req.body
    )
  } catch (err) {
    if (err instanceof Error) {
      return res.status(400).json({
        jsonrpc: '2.0',
        error: { code: -32000, message: err.message },
        id: null,
      })
    }

    return res.status(500).json({
      jsonrpc: '2.0',
      error: { code: -32603, message: 'Unable to process Payments MCP request' },
      id: null,
    })
  }
}

export default handler
