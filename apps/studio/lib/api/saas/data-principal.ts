import type { JwtPayload } from '@indobaseinc/indobase-js'

import type { DataPrincipalConsentType, DataPrincipalRequestType } from 'common'

import { ensureSaasTables, getGotrueUserId, type Claims } from './platform'
import { executeQuery } from './query'

export async function ensureDataPrincipalTables() {
  await ensureSaasTables()
  const ddl = await executeQuery({
    query: `
      create table if not exists saas.data_principal_consents (
        id bigserial primary key,
        gotrue_id uuid null,
        email text not null,
        consent_type text not null,
        consented boolean not null,
        consented_at timestamptz not null default now(),
        ip text null,
        user_agent text null,
        metadata jsonb not null default '{}'::jsonb
      );

      create index if not exists data_principal_consents_email_idx
        on saas.data_principal_consents (lower(email));

      create index if not exists data_principal_consents_gotrue_id_idx
        on saas.data_principal_consents (gotrue_id)
        where gotrue_id is not null;

      create table if not exists saas.data_principal_requests (
        id bigserial primary key,
        gotrue_id uuid not null,
        request_type text not null,
        status text not null default 'open',
        message text null,
        response text null,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now(),
        resolved_at timestamptz null,
        constraint data_principal_requests_type_check
          check (request_type in ('access', 'correction', 'erasure', 'grievance', 'nominate', 'consent_withdrawal')),
        constraint data_principal_requests_status_check
          check (status in ('open', 'in_progress', 'resolved', 'rejected'))
      );

      create index if not exists data_principal_requests_gotrue_id_idx
        on saas.data_principal_requests (gotrue_id, created_at desc);
    `,
  })
  if (ddl.error) throw ddl.error
}

export async function recordDataPrincipalConsent({
  email,
  gotrueId = null,
  consentType,
  consented,
  ip = null,
  userAgent = null,
  metadata = {},
}: {
  email: string
  gotrueId?: string | null
  consentType: DataPrincipalConsentType
  consented: boolean
  ip?: string | null
  userAgent?: string | null
  metadata?: Record<string, unknown>
}) {
  await ensureDataPrincipalTables()
  const result = await executeQuery<{ id: number }>({
    query: `
      insert into saas.data_principal_consents (
        gotrue_id, email, consent_type, consented, ip, user_agent, metadata
      )
      values ($1::uuid, lower($2), $3, $4, $5, $6, $7::jsonb)
      returning id
    `,
    parameters: [
      gotrueId,
      email.trim().toLowerCase(),
      consentType,
      consented,
      ip,
      userAgent,
      JSON.stringify(metadata),
    ],
  })
  if (result.error) throw result.error
  return result.data?.[0]?.id ?? null
}

export async function linkConsentsToGotrueId({
  email,
  gotrueId,
}: {
  email: string
  gotrueId: string
}) {
  await ensureDataPrincipalTables()
  await executeQuery({
    query: `
      update saas.data_principal_consents
      set gotrue_id = $1::uuid
      where lower(email) = lower($2)
        and gotrue_id is null
    `,
    parameters: [gotrueId, email],
  })
}

export async function createDataPrincipalRequest({
  claims,
  requestType,
  message,
}: {
  claims: Claims
  requestType: DataPrincipalRequestType
  message?: string | null
}) {
  await ensureDataPrincipalTables()
  const gotrueId = getGotrueUserId(claims)

  const inserted = await executeQuery<{
    id: number
    request_type: string
    status: string
    message: string | null
    created_at: string
  }>({
    query: `
      insert into saas.data_principal_requests (gotrue_id, request_type, message)
      values ($1::uuid, $2, $3)
      returning id, request_type, status, message, created_at
    `,
    parameters: [gotrueId, requestType, message ?? null],
    actorId: gotrueId,
  })
  if (inserted.error || !inserted.data?.length) {
    throw inserted.error ?? new Error('Failed to create data principal request')
  }
  return inserted.data[0]
}

export async function listDataPrincipalRequests(claims: Claims) {
  await ensureDataPrincipalTables()
  const gotrueId = getGotrueUserId(claims)

  const rows = await executeQuery<{
    id: number
    request_type: string
    status: string
    message: string | null
    created_at: string
    resolved_at: string | null
  }>({
    query: `
      select id, request_type, status, message, created_at, resolved_at
      from saas.data_principal_requests
      where gotrue_id = $1::uuid
      order by created_at desc
      limit 50
    `,
    parameters: [gotrueId],
    actorId: gotrueId,
  })
  if (rows.error) throw rows.error
  return rows.data ?? []
}

export async function exportUserPersonalData(claims: JwtPayload & Record<string, unknown>) {
  await ensureDataPrincipalTables()
  const gotrueId = getGotrueUserId(claims as Claims)

  const profile = await executeQuery({
    query: `
      select id, gotrue_id, primary_email, username, first_name, last_name, mobile,
             is_alpha_user, is_sso_user, inserted_at, updated_at
      from saas.profiles
      where gotrue_id = $1::uuid
    `,
    parameters: [gotrueId],
    actorId: gotrueId,
  })
  if (profile.error) throw profile.error

  const memberships = await executeQuery({
    query: `
      select o.slug, o.name, m.role, m.inserted_at
      from saas.organization_members m
      join saas.organizations o on o.id = m.organization_id
      where m.gotrue_id = $1::uuid
    `,
    parameters: [gotrueId],
    actorId: gotrueId,
  })
  if (memberships.error) throw memberships.error

  const projects = await executeQuery({
    query: `
      select p.ref, p.name, p.region, p.status, p.inserted_at, p.organization_slug
      from saas.projects p
      join saas.organization_members m on m.organization_id = p.organization_id
      where m.gotrue_id = $1::uuid
    `,
    parameters: [gotrueId],
    actorId: gotrueId,
  })
  if (projects.error) throw projects.error

  const consents = await executeQuery({
    query: `
      select consent_type, consented, consented_at
      from saas.data_principal_consents
      where gotrue_id = $1::uuid
         or lower(email) = lower($2)
      order by consented_at desc
    `,
    parameters: [gotrueId, (profile.data?.[0] as { primary_email?: string } | undefined)?.primary_email ?? ''],
    actorId: gotrueId,
  })
  if (consents.error) throw consents.error

  const requests = await listDataPrincipalRequests(claims as Claims)

  return {
    exported_at: new Date().toISOString(),
    regulatory_framework: 'DPDP Act, 2023 (India)',
    profile: profile.data?.[0] ?? null,
    organization_memberships: memberships.data ?? [],
    projects: projects.data ?? [],
    consent_records: consents.data ?? [],
    data_principal_requests: requests,
    notes: [
      'This export contains Indobase control-plane account metadata only.',
      'Application data stored in your project databases is under your control as Data Fiduciary.',
      'API keys, database passwords, and encrypted secrets are excluded for security.',
    ],
  }
}
