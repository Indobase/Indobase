import type { NextApiRequest, NextApiResponse } from 'next'

import {
  assertCallerMatchesRef,
  statusFromError,
  withVideoApiAuth,
  type VideoApiCaller,
} from 'lib/api/saas/video-api-handler'
import {
  assertVideoProjectAccess,
  getVideoProject,
  listVideoProjects,
  upsertVideoProject,
} from 'lib/api/saas/video-projects'
import { executeQuery } from 'lib/api/saas/query'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  return withVideoApiAuth(req, res, handle)
}

async function resolveOrgId(organizationSlug: string): Promise<number | null> {
  const rows = await executeQuery<{ id: number }>({
    query: `select id from saas.organizations where slug = $1 limit 1`,
    parameters: [organizationSlug],
  })
  if (rows.error) throw rows.error
  return rows.data?.[0]?.id ?? null
}

async function handle(req: NextApiRequest, res: NextApiResponse, caller: VideoApiCaller) {
  const ref = typeof req.query.ref === 'string' ? req.query.ref.trim() : ''
  if (!ref) {
    return res.status(400).json({ message: 'Project ref is required' })
  }

  try {
    assertCallerMatchesRef(caller, ref)
    const { project, userId } = await assertVideoProjectAccess({ claims: caller.claims, ref })

    if (req.method === 'GET') {
      const id = typeof req.query.id === 'string' ? req.query.id.trim() : ''
      if (id) {
        const record = await getVideoProject({
          id,
          projectRef: project.ref,
          ownerGotrueId: userId,
        })
        if (!record) {
          return res.status(404).json({ message: 'Video project not found' })
        }
        return res.status(200).json({ project: record })
      }

      const projects = await listVideoProjects({
        projectRef: project.ref,
        ownerGotrueId: userId,
      })
      let latest = null
      if (projects[0]) {
        latest = await getVideoProject({
          id: projects[0].id,
          projectRef: project.ref,
          ownerGotrueId: userId,
        })
      }
      return res.status(200).json({ projects, latest })
    }

    if (req.method === 'PUT') {
      const body = (req.body || {}) as {
        id?: string
        title?: string
        doc?: Record<string, unknown>
      }
      if (!body.doc || typeof body.doc !== 'object') {
        return res.status(400).json({ message: 'doc object is required' })
      }

      const orgId = await resolveOrgId(project.organization_slug)
      if (!orgId) {
        return res.status(404).json({ message: 'Organization not found' })
      }

      const saved = await upsertVideoProject({
        id: body.id,
        projectRef: project.ref,
        organizationId: orgId,
        ownerGotrueId: userId,
        title: body.title,
        doc: body.doc,
      })
      return res.status(200).json({ project: saved })
    }

    res.setHeader('Allow', ['GET', 'PUT', 'OPTIONS'])
    return res.status(405).json({ message: `Method ${req.method} Not Allowed` })
  } catch (error) {
    return res.status(statusFromError(error)).json({
      message: error instanceof Error ? error.message : 'Video projects request failed',
    })
  }
}
