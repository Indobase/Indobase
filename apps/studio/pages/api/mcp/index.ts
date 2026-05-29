import crypto from 'node:crypto'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { createSupabaseMcpServer, SupabasePlatform } from '@supabase/mcp-server-supabase'
import { stripIndent } from 'common-tags'
import { commaSeparatedStringIntoArray, fromNodeHeaders, zBooleanString } from 'lib/api/apiHelpers'
import {
  getAccountOperations,
  getDatabaseOperations,
  getDebuggingOperations,
  getDevelopmentOperations,
} from 'lib/api/saas/mcp'
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

const builderMcpTokenSchema = z.object({
  aud: z.literal('indobase-builder-mcp'),
  email: z.string().email(),
  exp: z.number(),
  iat: z.number(),
  iss: z.string().url(),
  organization_slug: z.string().min(1),
  project_ref: z.string().min(1),
  studio_url: z.string().url(),
  sub: z.string().min(1),
})

function resolveBuilderMcpSecret(): string | null {
  const secret =
    process.env.BUILDER_HANDOFF_SECRET?.trim() ||
    process.env.AUTH_JWT_SECRET?.trim() ||
    process.env.JWT_SECRET?.trim() ||
    ''

  return secret.length >= 32 ? secret : null
}

function decodeBase64Url(value: string) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
  const padding = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4))
  return Buffer.from(`${normalized}${padding}`, 'base64').toString('utf8')
}

function encodeBase64Url(value: Buffer | string) {
  const input = typeof value === 'string' ? Buffer.from(value) : value
  return input.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
}

async function verifyBuilderMcpToken(token: string) {
  const secret = resolveBuilderMcpSecret()

  if (!secret) {
    throw new Error('Builder MCP secret is not configured')
  }

  const parts = token.split('.')

  if (parts.length !== 3) {
    throw new Error('Invalid Builder MCP token format')
  }

  const [headerB64, payloadB64, signatureB64] = parts
  const expectedSignature = encodeBase64Url(
    crypto.createHmac('sha256', secret).update(`${headerB64}.${payloadB64}`).digest()
  )

  const providedSignatureBuffer = Buffer.from(signatureB64)
  const expectedSignatureBuffer = Buffer.from(expectedSignature)

  if (
    providedSignatureBuffer.length !== expectedSignatureBuffer.length ||
    !crypto.timingSafeEqual(providedSignatureBuffer, expectedSignatureBuffer)
  ) {
    throw new Error('Invalid Builder MCP token signature')
  }

  const header = JSON.parse(decodeBase64Url(headerB64))

  if (header.alg !== 'HS256') {
    throw new Error('Unsupported Builder MCP token algorithm')
  }

  const payload = builderMcpTokenSchema.parse(JSON.parse(decodeBase64Url(payloadB64)))

  if (payload.exp <= Math.floor(Date.now() / 1000)) {
    throw new Error('Builder MCP token has expired')
  }

  return payload
}

async function resolveMcpRequestAuth(req: NextApiRequest, requestedProjectRef?: string) {
  const authorization = req.headers.authorization?.trim()

  if (!authorization?.toLowerCase().startsWith('bearer ')) {
    return {
      authType: 'none' as const,
      claims: undefined,
      projectRef: requestedProjectRef,
    }
  }

  const token = authorization.replace(/^Bearer\s+/i, '')

  try {
    const builderClaims = await verifyBuilderMcpToken(token)
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
    return res.status(401).json({ error: message })
  }

  const headers = fromNodeHeaders(req.headers)

  if (auth.authType === 'builder') {
    headers.delete('authorization')
  }

  const resolvedProjectRef = auth.projectRef ?? DEFAULT_PROJECT.ref
  const userClaims = auth.authType === 'user' ? auth.claims : undefined

  const platform: SupabasePlatform = {
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
    const server = createSupabaseMcpServer({
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
    await transport.handleRequest(req, res, req.body)
  } catch (error) {
    if (error instanceof Error) {
      return res.status(400).json({ error: error.message })
    }

    return res.status(500).json({ error: 'Unable to process MCP request', cause: error })
  }
}

export default handler
