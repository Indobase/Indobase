import type { JwtPayload } from '@indobaseinc/indobase-js'

import crypto from 'node:crypto'

import { makeRandomString } from 'lib/helpers'
import { executeQuery } from './query'

export type Claims = JwtPayload & Record<string, any>

export type PlanId = 'free' | 'pro' | 'team' | 'enterprise' | 'platform'

export const PLAN_NAME: Record<PlanId, string> = {
  free: 'Starter',
  pro: 'Pro',
  team: 'Business',
  enterprise: 'Enterprise',
  platform: 'Platform',
}

export const normalizePlanId = (tier?: string): PlanId => {
  // Accept either `tier_*` (from CreateOrganization) or `plan` ids (from stored rows).
  switch (tier) {
    case 'free':
    case 'pro':
    case 'team':
    case 'enterprise':
    case 'platform':
      return tier
    case 'tier_free':
      return 'free'
    case 'tier_pro':
    case 'tier_payg':
      return 'pro'
    case 'tier_team':
      return 'team'
    case 'tier_enterprise':
      return 'enterprise'
    case 'tier_platform':
      return 'platform'
    default:
      return 'free'
  }
}

export function slugify(input: string) {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function uniqueSlug(base: string) {
  const clean = slugify(base)
  const suffix = makeRandomString(8).toLowerCase()
  return `${clean || 'org'}-${suffix}`
}

export function uniqueProjectRef(base: string) {
  const clean = slugify(base).replace(/-/g, '')
  const suffix = makeRandomString(10).toLowerCase()
  // Keep it reasonably URL-safe/alphanumeric.
  return `${clean || 'project'}-${suffix}`.replace(/[^a-z0-9-]/g, '').slice(0, 40)
}

const PLATFORM_SUSPENDED_ERR =
  'This organization has been suspended by the platform team. Contact support if you need access.'

export async function assertOrganizationNotPlatformSuspendedById(
  organizationId: number,
  actorId: string
) {
  const r = await executeQuery<{ restriction_status: string | null }>({
    query: `select restriction_status from saas.organizations where id = $1 limit 1`,
    parameters: [organizationId],
    actorId,
  })
  if (r.error) throw r.error
  if (r.data?.[0]?.restriction_status === 'platform_suspended') {
    throw new Error(PLATFORM_SUSPENDED_ERR)
  }
}

export async function assertOrganizationNotPlatformSuspendedBySlug(slug: string, actorId: string) {
  const r = await executeQuery<{ restriction_status: string | null }>({
    query: `select restriction_status from saas.organizations where slug = $1 limit 1`,
    parameters: [slug],
    actorId,
  })
  if (r.error) throw r.error
  if (r.data?.[0]?.restriction_status === 'platform_suspended') {
    throw new Error(PLATFORM_SUSPENDED_ERR)
  }
}

/** Deterministic localhost bind range for per-project PostgREST/GoTrue (base+1, base+2, …). */
export function computeDataPlanePortBase(projectRef: string): number {
  let h = 2166136261 >>> 0
  for (let i = 0; i < projectRef.length; i++) {
    h ^= projectRef.charCodeAt(i)
    h = Math.imul(h, 16777619) >>> 0
  }
  return 12000 + (h % 38000)
}

export function composeYamlSingleQuoted(value: string): string {
  return `'${String(value).replace(/'/g, "''")}'`
}

export function postgresJdbcUrlToEcto(jdbc: string): string {
  const t = jdbc.trim()
  if (t.startsWith('postgres://')) return `ecto://${t.slice('postgres://'.length)}`
  if (t.startsWith('postgresql://')) return `ecto://${t.slice('postgresql://'.length)}`
  return t.startsWith('ecto://') ? t : `ecto://${t}`
}

export function sanitizeComposeRefToken(ref: string): string {
  return ref.replace(/[^a-zA-Z0-9_]/g, '_')
}

export function buildTenantSupavisorPoolerExs(opts: {
  ref: string
  dbHost: string
  dbPort: string
  dbName: string
}): string {
  const { ref, dbHost, dbPort, dbName } = opts
  return `{:ok, _} = Application.ensure_all_started(:supavisor)

{:ok, version} =
  case Supavisor.Repo.query!("select version()") do
    %{rows: [[ver]]} -> Supavisor.Helpers.parse_pg_version(ver)
    _ -> nil
  end

aux_pwd = System.get_env("TENANT_POOLER_AUX_DB_PASSWORD") || ""

params = %{
  "external_id" => "${ref}",
  "db_host" => "${dbHost}",
  "db_port" => "${dbPort}",
  "db_database" => "${dbName}",
  "require_user" => false,
  "auth_query" => "SELECT * FROM pgbouncer.get_auth($1)",
  "default_max_clients" => "200",
  "default_pool_size" => "15",
  "default_parameter_status" => %{"server_version" => version},
  "users" => [%{
    "db_user" => "authenticator",
    "db_password" => aux_pwd,
    "mode_type" => "transaction",
    "pool_size" => "15",
    "is_manager" => true
  }]
}

if !Supavisor.Tenants.get_tenant_by_external_id(params["external_id"]) do
  {:ok, _} = Supavisor.Tenants.create_tenant(params)
end
`
}

export function indentLinesForComposeConfig(body: string, indent: string): string {
  return body
    .split('\n')
    .map((line) => (line.length ? indent + line : line))
    .join('\n')
}

/** Same host/db as `baseUrl`, swap login role; optional `rolePassword` overrides URL password (aux split-secrets). */
export function postgresUrlWithDbRole(
  baseUrl: string,
  roleUser: string,
  rolePassword?: string
): string {
  const normalized = baseUrl.startsWith('postgres://')
    ? `postgresql://${baseUrl.slice('postgres://'.length)}`
    : baseUrl
  const u = new URL(normalized)
  const password =
    rolePassword !== undefined && rolePassword !== ''
      ? rolePassword
      : u.password
        ? decodeURIComponent(u.password)
        : ''
  u.username = encodeURIComponent(roleUser)
  u.password = encodeURIComponent(password)
  return u.toString()
}

export function getGotrueUserId(claims: Claims): string {
  // Some JWT middleware returns a wrapper like:
  //   { claims: <actual_jwt_payload> }
  // Handle that to avoid "missing gotrue user id" crashes.
  const normalized: any =
    claims && typeof (claims as any).claims === 'object' ? (claims as any).claims : claims

  // GoTrue uses `sub` as the stable user id.
  // Depending on the GoTrue/JWT version and claim mapping, the user id can be nested.
  const id =
    normalized.sub ??
    normalized.id ??
    normalized.uid ??
    normalized.user_metadata?.sub ??
    normalized.user_metadata?.id ??
    normalized.user_metadata?.user_id ??
    normalized.user_id ??
    normalized.gotrue_id ??
    normalized.user?.id ??
    normalized.app_metadata?.sub

  if (typeof id !== 'string' || !id) {
    const keys = Object.keys(claims ?? {})
    throw new Error(`Missing gotrue user id in JWT claims (keys=${keys.join(',')})`)
  }
  return id
}

export function getPrimaryEmail(claims: Claims): string {
  const normalized: any =
    claims && typeof (claims as any).claims === 'object' ? (claims as any).claims : claims
  // JWT claims typically include `email`.
  const email = normalized.email ?? normalized.user_metadata?.email ?? normalized.user_metadata?.primary_email
  if (typeof email === 'string' && email) return email
  // Fallback so the API never explodes; UI can still handle missing email.
  // Prefer any resolved gotrue id (sub/user_id/etc) over claims.sub specifically.
  const gotrueId = (() => {
    try {
      return getGotrueUserId(claims)
    } catch {
      return undefined
    }
  })()

  return gotrueId ? `${gotrueId}@localhost` : 'unknown@example.com'
}

export function getUsernameFromEmail(email: string) {
  const base = email.split('@')[0]
  return slugify(base) || `user-${makeRandomString(6).toLowerCase()}`
}
