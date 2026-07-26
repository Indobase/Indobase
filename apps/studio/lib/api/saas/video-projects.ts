import type { JwtPayload } from '@indobaseinc/indobase-js'

import { ensureSaasTables, getGotrueUserId, getProject } from './platform'
import { executeQuery } from './query'
import { resolveVideoRole } from './video-launch'

type Claims = JwtPayload & Record<string, unknown>

export type VideoProjectSummary = {
  id: string
  project_ref: string
  title: string
  updated_at: string
  inserted_at: string
}

export type VideoProjectRecord = VideoProjectSummary & {
  owner_gotrue_id: string
  organization_id: number
  doc: Record<string, unknown>
}

const VIDEO_SCHEMA_SQL = `
alter table saas.organizations
  add column if not exists video_ai_used integer not null default 0;

create table if not exists saas.video_projects (
  id uuid primary key default gen_random_uuid(),
  organization_id integer not null references saas.organizations(id) on delete cascade,
  project_ref text not null references saas.projects(ref) on delete cascade,
  owner_gotrue_id uuid not null,
  title text not null default 'Untitled video',
  doc jsonb not null default '{}'::jsonb,
  inserted_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists saas_video_projects_ref_owner_idx
  on saas.video_projects (project_ref, owner_gotrue_id, updated_at desc);

create table if not exists saas.video_assets (
  id uuid primary key default gen_random_uuid(),
  video_project_id uuid not null references saas.video_projects(id) on delete cascade,
  project_ref text not null references saas.projects(ref) on delete cascade,
  owner_gotrue_id uuid not null,
  kind text not null check (kind in ('video', 'audio', 'image')),
  name text not null default '',
  storage_path text null,
  public_url text null,
  meta jsonb not null default '{}'::jsonb,
  inserted_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
`

let schemaReady: Promise<void> | null = null

async function ensureVideoSchema() {
  if (!schemaReady) {
    schemaReady = (async () => {
      await ensureSaasTables()
      const result = await executeQuery({ query: VIDEO_SCHEMA_SQL, parameters: [] })
      if (result.error) throw result.error
    })().catch((err) => {
      schemaReady = null
      throw err
    })
  }
  await schemaReady
}

export async function assertVideoProjectAccess(opts: {
  claims: Claims
  ref: string
}): Promise<{
  project: NonNullable<Awaited<ReturnType<typeof getProject>>>
  userId: string
  role: NonNullable<Awaited<ReturnType<typeof resolveVideoRole>>>
}> {
  const project = await getProject({ claims: opts.claims, ref: opts.ref })
  if (!project) {
    throw Object.assign(new Error('Project not found'), { status: 404 })
  }
  const userId = getGotrueUserId(opts.claims)
  const role = await resolveVideoRole(userId, project.organization_slug)
  if (!role) {
    throw Object.assign(
      new Error(
        'Ask an organization owner or admin to grant you Video access (owner, admin, developer, or viewer).'
      ),
      { status: 403 }
    )
  }
  return { project, userId, role }
}

function parseDoc(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as Record<string, unknown>
  }
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed
    } catch {
      /* ignore */
    }
  }
  return {}
}

export async function listVideoProjects(opts: {
  projectRef: string
  ownerGotrueId: string
}): Promise<VideoProjectSummary[]> {
  await ensureVideoSchema()
  const rows = await executeQuery<{
    id: string
    project_ref: string
    title: string
    updated_at: string
    inserted_at: string
  }>({
    query: `
      select id, project_ref, title, updated_at, inserted_at
      from saas.video_projects
      where project_ref = $1
        and owner_gotrue_id = $2::uuid
      order by updated_at desc
      limit 50
    `,
    parameters: [opts.projectRef, opts.ownerGotrueId],
  })
  if (rows.error) throw rows.error
  return rows.data ?? []
}

export async function getVideoProject(opts: {
  id: string
  projectRef: string
  ownerGotrueId: string
}): Promise<VideoProjectRecord | null> {
  await ensureVideoSchema()
  const rows = await executeQuery<{
    id: string
    project_ref: string
    title: string
    owner_gotrue_id: string
    organization_id: number
    doc: unknown
    updated_at: string
    inserted_at: string
  }>({
    query: `
      select id, project_ref, title, owner_gotrue_id, organization_id, doc, updated_at, inserted_at
      from saas.video_projects
      where id = $1::uuid
        and project_ref = $2
        and owner_gotrue_id = $3::uuid
      limit 1
    `,
    parameters: [opts.id, opts.projectRef, opts.ownerGotrueId],
  })
  if (rows.error) throw rows.error
  const row = rows.data?.[0]
  if (!row) return null
  return { ...row, doc: parseDoc(row.doc) }
}

export async function upsertVideoProject(opts: {
  id?: string | null
  projectRef: string
  organizationId: number
  ownerGotrueId: string
  title?: string
  doc: Record<string, unknown>
}): Promise<VideoProjectRecord> {
  await ensureVideoSchema()
  const title = (opts.title || 'Untitled video').trim().slice(0, 200) || 'Untitled video'
  const docJson = JSON.stringify(opts.doc ?? {})

  if (opts.id) {
    const updated = await executeQuery<{
      id: string
      project_ref: string
      title: string
      owner_gotrue_id: string
      organization_id: number
      doc: unknown
      updated_at: string
      inserted_at: string
    }>({
      query: `
        update saas.video_projects
        set
          title = $4,
          doc = $5::jsonb,
          updated_at = now()
        where id = $1::uuid
          and project_ref = $2
          and owner_gotrue_id = $3::uuid
        returning id, project_ref, title, owner_gotrue_id, organization_id, doc, updated_at, inserted_at
      `,
      parameters: [opts.id, opts.projectRef, opts.ownerGotrueId, title, docJson],
    })
    if (updated.error) throw updated.error
    const row = updated.data?.[0]
    if (row) {
      return { ...row, doc: parseDoc(row.doc) }
    }
  }

  const orgId =
    opts.organizationId ||
    (
      await executeQuery<{ id: number }>({
        query: `select o.id from saas.organizations o join saas.projects p on p.organization_slug = o.slug where p.ref = $1 limit 1`,
        parameters: [opts.projectRef],
      })
    ).data?.[0]?.id

  if (!orgId) {
    throw new Error('Organization not found for project')
  }

  const inserted = await executeQuery<{
    id: string
    project_ref: string
    title: string
    owner_gotrue_id: string
    organization_id: number
    doc: unknown
    updated_at: string
    inserted_at: string
  }>({
    query: `
      insert into saas.video_projects (
        organization_id, project_ref, owner_gotrue_id, title, doc
      ) values ($1, $2, $3::uuid, $4, $5::jsonb)
      returning id, project_ref, title, owner_gotrue_id, organization_id, doc, updated_at, inserted_at
    `,
    parameters: [orgId, opts.projectRef, opts.ownerGotrueId, title, docJson],
  })
  if (inserted.error) throw inserted.error
  const row = inserted.data?.[0]
  if (!row) throw new Error('Failed to save video project')
  return { ...row, doc: parseDoc(row.doc) }
}
