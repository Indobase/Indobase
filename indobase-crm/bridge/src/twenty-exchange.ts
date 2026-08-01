/**
 * Twenty CRM GraphQL exchange — Studio SSO → loginToken for /verify.
 *
 * Multi-tenant: one Twenty workspace per Indobase organization (`teamKey`).
 * Mapping (workspace id + invite hash) lives in the bridge workspace-map store.
 * Project scope stays soft via `ib_pipeline` query params (see crm-map).
 *
 * Users get a deterministic password derived from the handoff secret so the bridge
 * can sign them in without exposing an engine login UI.
 */
import { createHmac } from 'node:crypto'

import {
  crmWorkspaceOrigin,
  crmWorkspaceSubdomainForTeamKey,
} from './crm-map.js'
import {
  countMappedWorkspaces,
  getOrgWorkspace,
  saveOrgWorkspace,
  type OrgWorkspaceRecord,
} from './workspace-map.js'

export type TwentyExchangeResult = {
  loginToken: string
  created: boolean
  workspaceId: string
  inviteHash: string
  subdomain: string
}

type GraphqlError = { message?: string }
type GraphqlPayload<T> = { data?: T; errors?: GraphqlError[] }

type WorkspaceUrls = { subdomainUrl?: string; customUrl?: string }
type AvailableWorkspace = {
  id: string
  displayName?: string
  loginToken?: string
  inviteHash?: string
  workspaceUrls?: WorkspaceUrls
}
type AvailableWorkspaces = {
  availableWorkspacesForSignIn?: AvailableWorkspace[]
  availableWorkspacesForSignUp?: AvailableWorkspace[]
}
type AuthTokenPair = {
  accessOrWorkspaceAgnosticToken?: { token?: string }
  refreshToken?: { token?: string }
}

function graphqlUrl(upstream: string): string {
  return `${upstream.replace(/\/+$/, '')}/graphql`
}

export function derivedCrmPassword(email: string, secret: string): string {
  const digest = createHmac('sha256', secret)
    .update(`indobase-crm|${email.trim().toLowerCase()}`)
    .digest('base64url')
  // Meets typical complexity rules while remaining stable across handoffs.
  return `Ib1!${digest.slice(0, 28)}`
}

async function twentyGraphql<T>(
  upstream: string,
  query: string,
  variables: Record<string, unknown>,
  accessToken?: string,
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  }
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`

  const res = await fetch(graphqlUrl(upstream), {
    method: 'POST',
    headers,
    body: JSON.stringify({ query, variables }),
  })
  const raw = (await res.json().catch(() => ({}))) as GraphqlPayload<T>
  if (!res.ok) {
    const detail = raw.errors?.map((e) => e.message).filter(Boolean).join('; ') || `HTTP ${res.status}`
    throw new Error(`CRM GraphQL failed: ${detail}`)
  }
  if (raw.errors?.length) {
    throw new Error(raw.errors.map((e) => e.message || 'unknown').join('; '))
  }
  if (!raw.data) throw new Error('CRM GraphQL returned no data')
  return raw.data
}

function flattenAvailable(ws: AvailableWorkspaces | undefined): AvailableWorkspace[] {
  if (!ws) return []
  return [...(ws.availableWorkspacesForSignIn || []), ...(ws.availableWorkspacesForSignUp || [])]
}

async function signIn(
  upstream: string,
  email: string,
  password: string,
): Promise<{ tokens: AuthTokenPair; availableWorkspaces: AvailableWorkspaces } | null> {
  try {
    const data = await twentyGraphql<{
      signIn: { tokens: AuthTokenPair; availableWorkspaces: AvailableWorkspaces }
    }>(
      upstream,
      `mutation SignIn($email: String!, $password: String!) {
        signIn(email: $email, password: $password) {
          tokens {
            accessOrWorkspaceAgnosticToken { token }
            refreshToken { token }
          }
          availableWorkspaces {
            availableWorkspacesForSignIn {
              id displayName loginToken inviteHash
              workspaceUrls { subdomainUrl customUrl }
            }
            availableWorkspacesForSignUp {
              id displayName loginToken inviteHash
              workspaceUrls { subdomainUrl customUrl }
            }
          }
        }
      }`,
      { email, password },
    )
    return data.signIn
  } catch {
    return null
  }
}

async function signUpUser(
  upstream: string,
  email: string,
  password: string,
): Promise<{ tokens: AuthTokenPair; availableWorkspaces: AvailableWorkspaces }> {
  const data = await twentyGraphql<{
    signUp: { tokens: AuthTokenPair; availableWorkspaces: AvailableWorkspaces }
  }>(
    upstream,
    `mutation SignUp($email: String!, $password: String!) {
      signUp(email: $email, password: $password) {
        tokens {
          accessOrWorkspaceAgnosticToken { token }
          refreshToken { token }
        }
        availableWorkspaces {
          availableWorkspacesForSignIn {
            id displayName loginToken inviteHash
            workspaceUrls { subdomainUrl customUrl }
          }
          availableWorkspacesForSignUp {
            id displayName loginToken inviteHash
            workspaceUrls { subdomainUrl customUrl }
          }
        }
      }
    }`,
    { email, password },
  )
  return data.signUp
}

async function signUpInWorkspace(
  upstream: string,
  email: string,
  password: string,
  workspaceInviteHash: string,
): Promise<{ loginToken: string; workspaceId: string; subdomainUrl?: string }> {
  const data = await twentyGraphql<{
    signUpInWorkspace: {
      loginToken: { token: string }
      workspace: { id: string; workspaceUrls?: WorkspaceUrls }
    }
  }>(
    upstream,
    `mutation SignUpInWorkspace($email: String!, $password: String!, $workspaceInviteHash: String!) {
      signUpInWorkspace(email: $email, password: $password, workspaceInviteHash: $workspaceInviteHash) {
        loginToken { token }
        workspace {
          id
          workspaceUrls { subdomainUrl customUrl }
        }
      }
    }`,
    { email, password, workspaceInviteHash },
  )
  return {
    loginToken: data.signUpInWorkspace.loginToken.token,
    workspaceId: data.signUpInWorkspace.workspace.id,
    subdomainUrl: data.signUpInWorkspace.workspace.workspaceUrls?.subdomainUrl,
  }
}

async function signUpInNewWorkspace(
  upstream: string,
  accessToken: string,
  input: { displayName: string; subdomain: string },
): Promise<{ loginToken: string; workspaceId: string; subdomainUrl?: string }> {
  const data = await twentyGraphql<{
    signUpInNewWorkspace: {
      loginToken: { token: string }
      workspace: { id: string; workspaceUrls?: WorkspaceUrls }
    }
  }>(
    upstream,
    `mutation SignUpInNewWorkspace($input: SignUpInNewWorkspaceInput) {
      signUpInNewWorkspace(input: $input) {
        loginToken { token }
        workspace {
          id
          workspaceUrls { subdomainUrl customUrl }
        }
      }
    }`,
    { input },
    accessToken,
  )
  return {
    loginToken: data.signUpInNewWorkspace.loginToken.token,
    workspaceId: data.signUpInNewWorkspace.workspace.id,
    subdomainUrl: data.signUpInNewWorkspace.workspace.workspaceUrls?.subdomainUrl,
  }
}

async function getAuthTokensFromLoginToken(
  upstream: string,
  loginToken: string,
  origin: string,
): Promise<string> {
  const data = await twentyGraphql<{
    getAuthTokensFromLoginToken: { tokens: AuthTokenPair }
  }>(
    upstream,
    `mutation GetAuthTokensFromLoginToken($loginToken: String!, $origin: String!) {
      getAuthTokensFromLoginToken(loginToken: $loginToken, origin: $origin) {
        tokens {
          accessOrWorkspaceAgnosticToken { token }
          refreshToken { token }
        }
      }
    }`,
    { loginToken, origin },
  )
  const token = data.getAuthTokensFromLoginToken.tokens.accessOrWorkspaceAgnosticToken?.token
  if (!token) throw new Error('CRM did not return an access token after workspace login')
  return token
}

async function activateWorkspace(
  upstream: string,
  accessToken: string,
): Promise<{ id: string; inviteHash: string; subdomain: string; displayName?: string }> {
  const data = await twentyGraphql<{
    activateWorkspace: {
      id: string
      inviteHash?: string
      subdomain?: string
      displayName?: string
      activationStatus?: string
    }
  }>(
    upstream,
    `mutation ActivateWorkspace($input: ActivateWorkspaceInput!) {
      activateWorkspace(data: $input) {
        id
        inviteHash
        subdomain
        displayName
        activationStatus
      }
    }`,
    { input: {} },
    accessToken,
  )
  const ws = data.activateWorkspace
  if (!ws?.id || !ws.inviteHash) {
    throw new Error('CRM workspace activation did not return inviteHash')
  }
  return {
    id: ws.id,
    inviteHash: ws.inviteHash,
    subdomain: ws.subdomain || '',
    displayName: ws.displayName,
  }
}

async function ensureUserAgnosticToken(
  upstream: string,
  email: string,
  password: string,
): Promise<{ accessToken: string; created: boolean; available: AvailableWorkspace[] }> {
  const existing = await signIn(upstream, email, password)
  if (existing?.tokens.accessOrWorkspaceAgnosticToken?.token) {
    return {
      accessToken: existing.tokens.accessOrWorkspaceAgnosticToken.token,
      created: false,
      available: flattenAvailable(existing.availableWorkspaces),
    }
  }
  const created = await signUpUser(upstream, email, password)
  const token = created.tokens.accessOrWorkspaceAgnosticToken?.token
  if (!token) throw new Error('CRM sign-up did not return an access token')
  return {
    accessToken: token,
    created: true,
    available: flattenAvailable(created.availableWorkspaces),
  }
}

function loginTokenFromAvailable(
  available: AvailableWorkspace[],
  workspaceId: string,
): string | null {
  const match = available.find((w) => w.id === workspaceId && w.loginToken)
  return match?.loginToken || null
}

async function joinOrLoginMappedWorkspace(opts: {
  upstream: string
  email: string
  password: string
  record: OrgWorkspaceRecord
}): Promise<{ loginToken: string; created: boolean }> {
  const signedIn = await signIn(opts.upstream, opts.email, opts.password)
  if (signedIn) {
    const fromList = loginTokenFromAvailable(
      flattenAvailable(signedIn.availableWorkspaces),
      opts.record.workspaceId,
    )
    if (fromList) return { loginToken: fromList, created: false }
  }

  const joined = await signUpInWorkspace(
    opts.upstream,
    opts.email,
    opts.password,
    opts.record.inviteHash,
  )
  return { loginToken: joined.loginToken, created: true }
}

async function provisionOrgWorkspace(opts: {
  upstream: string
  email: string
  password: string
  orgSlug: string
  teamKey: string
  teamTitle: string
  publicBaseUrl: string
}): Promise<TwentyExchangeResult> {
  const subdomain = crmWorkspaceSubdomainForTeamKey(opts.teamKey)
  const displayName = (opts.teamTitle || opts.orgSlug || 'Organization').slice(0, 100)

  const user = await ensureUserAgnosticToken(opts.upstream, opts.email, opts.password)
  const created = await signUpInNewWorkspace(opts.upstream, user.accessToken, {
    displayName,
    subdomain,
  })

  const origin =
    created.subdomainUrl || crmWorkspaceOrigin(opts.publicBaseUrl, subdomain)
  const workspaceAccessToken = await getAuthTokensFromLoginToken(
    opts.upstream,
    created.loginToken,
    origin,
  )
  const activated = await activateWorkspace(opts.upstream, workspaceAccessToken)
  const finalSubdomain = activated.subdomain || subdomain

  saveOrgWorkspace({
    orgSlug: opts.orgSlug,
    teamKey: opts.teamKey,
    workspaceId: activated.id,
    inviteHash: activated.inviteHash,
    subdomain: finalSubdomain,
    displayName: activated.displayName || displayName,
    createdAt: new Date().toISOString(),
  })

  return {
    loginToken: created.loginToken,
    created: true,
    workspaceId: activated.id,
    inviteHash: activated.inviteHash,
    subdomain: finalSubdomain,
  }
}

/**
 * Claim a legacy single-workspace invite for the first org that opens CRM
 * (migration from pre-multi-tenant bootstraps). Only when the map is empty.
 */
async function claimLegacyInvite(opts: {
  upstream: string
  email: string
  password: string
  orgSlug: string
  teamKey: string
  teamTitle: string
  inviteHash: string
  publicBaseUrl: string
}): Promise<TwentyExchangeResult | null> {
  if (countMappedWorkspaces() > 0) return null
  try {
    const joined = await signUpInWorkspace(
      opts.upstream,
      opts.email,
      opts.password,
      opts.inviteHash,
    )
    const subdomain =
      crmWorkspaceSubdomainForTeamKey(opts.teamKey)
    const origin = joined.subdomainUrl || crmWorkspaceOrigin(opts.publicBaseUrl, subdomain)
    // Best-effort: activate may already be done; ignore activation errors.
    let inviteHash = opts.inviteHash
    let subdomainFinal = subdomain
    try {
      const access = await getAuthTokensFromLoginToken(
        opts.upstream,
        joined.loginToken,
        origin,
      )
      const activated = await activateWorkspace(opts.upstream, access)
      inviteHash = activated.inviteHash || inviteHash
      subdomainFinal = activated.subdomain || subdomainFinal
    } catch {
      // already active / origin mismatch — keep invite from env
    }

    saveOrgWorkspace({
      orgSlug: opts.orgSlug,
      teamKey: opts.teamKey,
      workspaceId: joined.workspaceId,
      inviteHash,
      subdomain: subdomainFinal,
      displayName: (opts.teamTitle || opts.orgSlug || 'Organization').slice(0, 100),
      createdAt: new Date().toISOString(),
    })

    return {
      loginToken: joined.loginToken,
      created: true,
      workspaceId: joined.workspaceId,
      inviteHash,
      subdomain: subdomainFinal,
    }
  } catch {
    return null
  }
}

/**
 * Ensure the Studio user can open the org's CRM workspace and return a loginToken for /verify.
 */
export async function exchangeStudioUserForTwentyLoginToken(opts: {
  upstream: string
  email: string
  handoffSecret: string
  orgSlug: string
  teamKey: string
  teamTitle?: string
  publicBaseUrl: string
  /** Legacy single-workspace invite — used only when map is empty (migration). */
  legacyWorkspaceInviteHash?: string
  /** When true, create a new Twenty workspace if this org has no mapping yet. */
  allowCreateWorkspace?: boolean
}): Promise<TwentyExchangeResult> {
  const email = opts.email.trim().toLowerCase()
  if (!email || !email.includes('@')) {
    throw new Error('Missing email for CRM handoff')
  }
  const teamKey = opts.teamKey.trim()
  if (!teamKey) {
    throw new Error('Missing organization scope for CRM handoff')
  }

  const password = derivedCrmPassword(email, opts.handoffSecret)
  const existing = getOrgWorkspace(teamKey)
  if (existing) {
    const session = await joinOrLoginMappedWorkspace({
      upstream: opts.upstream,
      email,
      password,
      record: existing,
    })
    return {
      loginToken: session.loginToken,
      created: session.created,
      workspaceId: existing.workspaceId,
      inviteHash: existing.inviteHash,
      subdomain: existing.subdomain,
    }
  }

  const legacy = (opts.legacyWorkspaceInviteHash || '').trim()
  if (legacy) {
    const claimed = await claimLegacyInvite({
      upstream: opts.upstream,
      email,
      password,
      orgSlug: opts.orgSlug,
      teamKey,
      teamTitle: opts.teamTitle || opts.orgSlug,
      inviteHash: legacy,
      publicBaseUrl: opts.publicBaseUrl,
    })
    if (claimed) return claimed
  }

  if (opts.allowCreateWorkspace !== false) {
    return provisionOrgWorkspace({
      upstream: opts.upstream,
      email,
      password,
      orgSlug: opts.orgSlug,
      teamKey,
      teamTitle: opts.teamTitle || opts.orgSlug,
      publicBaseUrl: opts.publicBaseUrl,
    })
  }

  throw new Error(
    'CRM workspace is not provisioned for this organization. Open CRM once as an org member to create it, or restore the workspace map.',
  )
}

export function twentyVerifyPath(loginToken: string, nextPath = '/'): string {
  const next = nextPath.startsWith('/') && !nextPath.startsWith('//') ? nextPath : '/'
  const params = new URLSearchParams({ loginToken })
  if (next !== '/') params.set('redirect', next)
  return `/verify?${params.toString()}`
}
