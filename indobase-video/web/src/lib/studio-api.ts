import type { ProjectDocument, SessionInfo, VideoSceneDraft } from './types'

export type VideoAiQuota = {
  plan: string
  used: number
  limit: number | null
  remaining: number | null
  ttsAvailable?: boolean
  upgradeUrl?: string
}

export type CloudVideoProject = {
  id: string
  project_ref: string
  title: string
  doc: ProjectDocument
  updated_at: string
  inserted_at: string
}

type ApiError = Error & { status?: number; code?: string; quota?: VideoAiQuota }

async function apiFetch<T>(
  session: SessionInfo,
  path: string,
  init?: RequestInit
): Promise<T> {
  const studio =
    session.studio_url ||
    import.meta.env.VITE_STUDIO_PUBLIC_URL ||
    'https://studio.indobase.in'
  const url = path.startsWith('http') ? path : `${studio.replace(/\/+$/, '')}${path}`

  const headers = new Headers(init?.headers || {})
  if (!headers.has('Content-Type') && init?.body) {
    headers.set('Content-Type', 'application/json')
  }
  if (session.api_token) {
    headers.set('Authorization', `Bearer ${session.api_token}`)
  }

  const res = await fetch(url, {
    ...init,
    headers,
    credentials: 'omit',
  })

  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (!res.ok) {
    const err = new Error(
      typeof json.message === 'string' ? json.message : `Request failed (${res.status})`
    ) as ApiError
    err.status = res.status
    if (typeof json.code === 'string') err.code = json.code
    if (json.quota && typeof json.quota === 'object') err.quota = json.quota as VideoAiQuota
    throw err
  }
  return json as T
}

function projectsPath(ref: string) {
  return `/api/platform/projects/${encodeURIComponent(ref)}/video/projects`
}

export async function fetchVideoQuota(session: SessionInfo): Promise<VideoAiQuota> {
  return apiFetch(session, `/api/platform/projects/${encodeURIComponent(session.project_ref)}/video/quota`)
}

export async function listCloudProjects(session: SessionInfo): Promise<{
  projects: CloudVideoProject[]
  latest: CloudVideoProject | null
}> {
  const data = await apiFetch<{
    projects: Array<Omit<CloudVideoProject, 'doc'> & { doc?: ProjectDocument }>
    latest?: CloudVideoProject | null
  }>(session, projectsPath(session.project_ref))
  return {
    projects: (data.projects || []).map((p) => ({
      ...p,
      doc: (p.doc || {
        version: 1,
        projectRef: session.project_ref,
        projectName: session.project_name,
        updatedAt: Date.now(),
        clips: [],
        canvas: { width: 1280, height: 720, fps: 30 },
      }) as ProjectDocument,
    })),
    latest: data.latest || null,
  }
}

export async function loadCloudProject(
  session: SessionInfo,
  id: string
): Promise<CloudVideoProject | null> {
  const data = await apiFetch<{ project: CloudVideoProject }>(
    session,
    `${projectsPath(session.project_ref)}?id=${encodeURIComponent(id)}`
  )
  return data.project || null
}

export async function saveCloudProject(
  session: SessionInfo,
  opts: { id?: string; title?: string; doc: ProjectDocument }
): Promise<CloudVideoProject> {
  const data = await apiFetch<{ project: CloudVideoProject }>(
    session,
    projectsPath(session.project_ref),
    {
      method: 'PUT',
      body: JSON.stringify(opts),
    }
  )
  return data.project
}

export async function generateStoryboard(
  session: SessionInfo,
  opts: { prompt: string; durationTargetSec?: number; aspect?: '16:9' | '9:16' | '1:1' }
): Promise<{
  title: string
  aspect: '16:9' | '9:16' | '1:1'
  scenes: VideoSceneDraft[]
  model: string
  quota?: VideoAiQuota
}> {
  return apiFetch(
    session,
    `/api/platform/projects/${encodeURIComponent(session.project_ref)}/video/generate`,
    {
      method: 'POST',
      body: JSON.stringify(opts),
    }
  )
}

export async function synthesizeTts(
  session: SessionInfo,
  opts: { text: string; voice?: string }
): Promise<
  | {
      available: true
      provider: string
      mime: string
      extension: string
      audioBase64: string
      quota?: VideoAiQuota
    }
  | { available: false; message: string; quota?: VideoAiQuota }
> {
  return apiFetch(
    session,
    `/api/platform/projects/${encodeURIComponent(session.project_ref)}/video/tts`,
    {
      method: 'POST',
      body: JSON.stringify(opts),
    }
  )
}

export function base64ToBlob(base64: string, mime: string): Blob {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes], { type: mime })
}
