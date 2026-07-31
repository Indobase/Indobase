/**
 * Thin Mattermost Admin API client for Studio SSO exchange.
 * Never expose "Mattermost" strings to end users — errors are generic.
 */
import { createHmac, randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'

import type { DiscussRole, StudioClaims } from './auth.js'
import {
  applyTeamChannelPlan,
  shouldRelabelChannel,
  type MmApiCall,
} from './channel-plan.js'
import type { DiscussSpaceMap } from './space-map.js'

export type MattermostSession = {
  userId: string
  token: string
  redirect: string
}

type MmUser = { id: string; email: string; username: string }
type MmTeam = { id: string; name: string }
type MmChannel = { id: string; name: string; team_id: string }

function resolveBaseUrl(): string {
  return (process.env.MATTERMOST_URL || '').replace(/\/+$/, '')
}

export function isMattermostConfigured(): boolean {
  return Boolean(resolveBaseUrl())
}

function resolveAdminToken(): string {
  const fromEnv = (process.env.MATTERMOST_ADMIN_TOKEN || '').trim()
  if (fromEnv) return fromEnv
  const file = (process.env.MATTERMOST_ADMIN_TOKEN_FILE || '').trim()
  if (file) {
    try {
      return readFileSync(file, 'utf8').trim()
    } catch {
      return ''
    }
  }
  return ''
}

async function mmFetch(
  path: string,
  opts: {
    method?: string
    token?: string
    body?: unknown
    raw?: boolean
  } = {}
): Promise<{ status: number; json: unknown; tokenHeader: string | null }> {
  const base = resolveBaseUrl()
  if (!base) throw new Error('MATTERMOST_URL not set')

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`

  const res = await fetch(`${base}${path}`, {
    method: opts.method || (opts.body ? 'POST' : 'GET'),
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  })

  const tokenHeader = res.headers.get('Token') || res.headers.get('token')
  let json: unknown = null
  const text = await res.text()
  if (text) {
    try {
      json = JSON.parse(text)
    } catch {
      json = { raw: text }
    }
  }
  return { status: res.status, json, tokenHeader }
}

function usernameFromClaims(claims: StudioClaims): string {
  // Mattermost: 3–22 chars, lowercase alphanumeric + . _ -
  const base = `ib${claims.sub.replace(/[^a-zA-Z0-9]/g, '').toLowerCase()}`.slice(0, 22)
  return base.length >= 3 ? base : `ib${randomBytes(4).toString('hex')}`
}

/** Deterministic password so SSO can mint a browser session via /users/login. */
export function derivedPassword(claims: StudioClaims, handoffSecret: string): string {
  return createHmac('sha256', handoffSecret)
    .update(`discuss-mm:${claims.sub}:${claims.email.toLowerCase()}`)
    .digest('base64url')
    .slice(0, 48)
}

async function findUserByEmail(adminToken: string, email: string): Promise<MmUser | null> {
  const { status, json } = await mmFetch(`/api/v4/users/email/${encodeURIComponent(email)}`, {
    token: adminToken,
  })
  if (status === 404) return null
  if (status !== 200) {
    console.error('[discuss] find user failed', status, json)
    return null
  }
  return json as MmUser
}

async function ensureUser(
  adminToken: string,
  claims: StudioClaims,
  password: string
): Promise<MmUser> {
  const existing = await findUserByEmail(adminToken, claims.email)
  if (existing) {
    const upd = await mmFetch(`/api/v4/users/${existing.id}/password`, {
      method: 'PUT',
      token: adminToken,
      body: { new_password: password },
    })
    if (upd.status !== 200) {
      console.error('[discuss] password update failed', upd.status, upd.json)
      throw new Error('Could not prepare Discuss session')
    }
    // Sync display name lightly
    await mmFetch(`/api/v4/users/${existing.id}/patch`, {
      method: 'PUT',
      token: adminToken,
      body: {
        first_name: claims.organization_name || '',
        last_name: claims.role,
        props: {
          indobase_gotrue_id: claims.sub,
          indobase_project_ref: claims.project_ref,
        },
      },
    }).catch(() => null)
    return existing
  }

  const created = await mmFetch('/api/v4/users', {
    method: 'POST',
    token: adminToken,
    body: {
      email: claims.email,
      username: usernameFromClaims(claims),
      password,
      first_name: (claims.organization_name || claims.email.split('@')[0] || 'User').slice(0, 64),
      last_name: claims.role,
      email_verified: true,
    },
  })
  if (created.status !== 201 && created.status !== 200) {
    console.error('[discuss] create user failed', created.status, created.json)
    throw new Error('Could not provision Discuss user')
  }
  const user = created.json as MmUser
  await mmFetch(`/api/v4/users/${user.id}/email/verify/member`, {
    method: 'POST',
    token: adminToken,
  }).catch(() => null)
  return user
}

/** Admin-scoped adapter handed to the channel plan (keeps that module fetch-free). */
function adminApi(adminToken: string): MmApiCall {
  return async (path, init) => {
    const res = await mmFetch(path, {
      method: init?.method ?? 'GET',
      token: adminToken,
      body: init?.body,
    })
    return { status: res.status, json: res.json }
  }
}

async function ensureTeam(adminToken: string, map: DiscussSpaceMap): Promise<MmTeam> {
  const byName = await mmFetch(`/api/v4/teams/name/${encodeURIComponent(map.teamKey)}`, {
    token: adminToken,
  })
  if (byName.status === 200) return byName.json as MmTeam

  const created = await mmFetch('/api/v4/teams', {
    method: 'POST',
    token: adminToken,
    body: {
      name: map.teamKey,
      display_name: map.teamTitle.slice(0, 64),
      type: 'I',
      description: `Indobase org ${map.orgSlug}`.slice(0, 255),
      allow_open_invite: false,
    },
  })
  if (created.status !== 201 && created.status !== 200) {
    // Race: another request created it
    const retry = await mmFetch(`/api/v4/teams/name/${encodeURIComponent(map.teamKey)}`, {
      token: adminToken,
    })
    if (retry.status === 200) return retry.json as MmTeam
    console.error('[discuss] create team failed', created.status, created.json)
    throw new Error('Could not provision Discuss team')
  }
  const team = created.json as MmTeam
  // Only on create: reshape the auto-seeded Town Square / Off-Topic into the
  // Indobase workspace. Best effort — never block SSO on it. Existing teams are
  // retrofitted by docker/bootstrap-mattermost.sh instead of on every login.
  try {
    const plan = await applyTeamChannelPlan(adminApi(adminToken), team.id)
    if (plan.failed.length) console.warn('[discuss] channel plan partial', plan)
  } catch (err) {
    console.warn('[discuss] channel plan skipped', err)
  }
  return team
}

async function ensureChannel(
  adminToken: string,
  team: MmTeam,
  map: DiscussSpaceMap
): Promise<MmChannel> {
  const byName = await mmFetch(
    `/api/v4/teams/${team.id}/channels/name/${encodeURIComponent(map.spaceKey)}`,
    { token: adminToken }
  )
  if (byName.status === 200) {
    const existing = byName.json as MmChannel & { display_name?: string }
    // Heal a channel whose label is still the internal key (or blank) — the slug
    // is a deep link and never moves, only the human label does. An admin's own
    // rename is left alone (see shouldRelabelChannel).
    if (shouldRelabelChannel(map.spaceKey, existing.display_name, map.spaceTitle)) {
      await mmFetch(`/api/v4/channels/${existing.id}/patch`, {
        method: 'PUT',
        token: adminToken,
        body: { display_name: map.spaceTitle.slice(0, 64) },
      }).catch(() => null)
    }
    return existing
  }

  const created = await mmFetch('/api/v4/channels', {
    method: 'POST',
    token: adminToken,
    body: {
      team_id: team.id,
      name: map.spaceKey,
      display_name: map.spaceTitle.slice(0, 64),
      type: 'P',
      header: `Project ${map.projectRef}`.slice(0, 1024),
      purpose: 'Indobase project team chat',
    },
  })
  if (created.status !== 201 && created.status !== 200) {
    const retry = await mmFetch(
      `/api/v4/teams/${team.id}/channels/name/${encodeURIComponent(map.spaceKey)}`,
      { token: adminToken }
    )
    if (retry.status === 200) return retry.json as MmChannel
    console.error('[discuss] create channel failed', created.status, created.json)
    throw new Error('Could not provision Discuss channel')
  }
  return created.json as MmChannel
}

async function addUserToTeam(adminToken: string, teamId: string, userId: string, role: DiscussRole) {
  await mmFetch(`/api/v4/teams/${teamId}/members`, {
    method: 'POST',
    token: adminToken,
    body: { team_id: teamId, user_id: userId },
  })
  const roles = role === 'viewer' ? 'team_user' : 'team_user team_admin'
  await mmFetch(`/api/v4/teams/${teamId}/members/${userId}/roles`, {
    method: 'PUT',
    token: adminToken,
    body: { roles },
  }).catch(() => null)
}

async function addUserToChannel(adminToken: string, channelId: string, userId: string) {
  await mmFetch(`/api/v4/channels/${channelId}/members`, {
    method: 'POST',
    token: adminToken,
    body: { user_id: userId },
  })
}

async function loginUser(email: string, password: string): Promise<{ userId: string; token: string }> {
  const base = resolveBaseUrl()
  const res = await fetch(`${base}/api/v4/users/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ login_id: email, password }),
  })
  const token = res.headers.get('Token') || res.headers.get('token')
  const body = (await res.json().catch(() => ({}))) as { id?: string; message?: string }
  if (!res.ok || !token || !body.id) {
    console.error('[discuss] login failed', res.status, body)
    throw new Error('Could not open Discuss session')
  }
  return { userId: body.id, token }
}

/**
 * Verify Studio claims already done by caller. Provisions team/channel/user and
 * returns Mattermost session cookies material + redirect path.
 */
export async function exchangeStudioClaimsForMattermost(
  claims: StudioClaims,
  map: DiscussSpaceMap,
  handoffSecret: string
): Promise<MattermostSession> {
  const adminToken = resolveAdminToken()
  if (!adminToken) {
    throw new Error('Discuss upstream is not ready (admin token missing)')
  }

  const password = derivedPassword(claims, handoffSecret)
  const user = await ensureUser(adminToken, claims, password)
  const team = await ensureTeam(adminToken, map)
  await addUserToTeam(adminToken, team.id, user.id, claims.role)
  const channel = await ensureChannel(adminToken, team, map)
  await addUserToChannel(adminToken, channel.id, user.id)

  const session = await loginUser(claims.email, password)
  return {
    userId: session.userId,
    token: session.token,
    redirect: `/${map.teamKey}/channels/${map.spaceKey}`,
  }
}

export function mattermostSessionCookies(session: MattermostSession): string[] {
  const common = 'Path=/; HttpOnly; Secure; SameSite=Lax'
  return [
    `MMAUTHTOKEN=${session.token}; ${common}`,
    `MMUSERID=${session.userId}; Path=/; Secure; SameSite=Lax`,
  ]
}

export async function mattermostPing(): Promise<boolean> {
  const base = resolveBaseUrl()
  if (!base) return false
  try {
    const res = await fetch(`${base}/api/v4/system/ping`, { method: 'GET' })
    return res.ok
  } catch {
    return false
  }
}
