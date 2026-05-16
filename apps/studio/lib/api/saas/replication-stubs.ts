import type { NextApiRequest, NextApiResponse } from 'next'

export function parseRef(req: NextApiRequest): string {
  const raw = req.query.ref
  return typeof raw === 'string' ? raw : Array.isArray(raw) ? raw[0] : ''
}

export function parsePathInt(req: NextApiRequest, key: string): number {
  const raw = req.query[key]
  const s = typeof raw === 'string' ? raw : Array.isArray(raw) ? raw[0] : ''
  const n = Number.parseInt(s, 10)
  return Number.isFinite(n) ? n : 0
}

export function methodNotAllowed(
  res: NextApiResponse,
  method: string | undefined,
  allowed: string[]
) {
  res.setHeader('Allow', allowed)
  return res.status(405).json({ data: null, error: { message: `Method ${method} Not Allowed` } })
}

function requireRef(req: NextApiRequest, res: NextApiResponse): string | null {
  const ref = parseRef(req)
  if (!ref) {
    res.status(400).json({ message: 'Project ref is required' })
    return null
  }
  return ref
}

export async function handleReplicationSourcesGet(req: NextApiRequest, res: NextApiResponse) {
  if (!requireRef(req, res)) return
  return res.status(200).json({ sources: [] })
}

export async function handleReplicationSourcesPost(req: NextApiRequest, res: NextApiResponse) {
  if (!requireRef(req, res)) return
  return res.status(200).json({ id: 1 })
}

export async function handleReplicationDestinationsGet(req: NextApiRequest, res: NextApiResponse) {
  if (!requireRef(req, res)) return
  return res.status(200).json({ destinations: [] })
}

export async function handleReplicationDestinationByIdGet(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (!requireRef(req, res)) return
  return res.status(404).json({ message: 'Destination not found' })
}

export async function handleReplicationDestinationsValidatePost(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (!requireRef(req, res)) return
  return res.status(200).json({ validation_failures: [] })
}

export async function handleReplicationPipelinesGet(req: NextApiRequest, res: NextApiResponse) {
  if (!requireRef(req, res)) return
  return res.status(200).json({ pipelines: [] })
}

export async function handleReplicationPipelinesPost(req: NextApiRequest, res: NextApiResponse) {
  if (!requireRef(req, res)) return
  return res.status(404).json({ message: 'Replication is not available on this deployment' })
}

export async function handleReplicationPipelinesValidatePost(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (!requireRef(req, res)) return
  return res.status(200).json({ validation_failures: [] })
}

export async function handleReplicationPipelineByIdGet(req: NextApiRequest, res: NextApiResponse) {
  if (!requireRef(req, res)) return
  return res.status(404).json({ message: 'Pipeline not found' })
}

export async function handleReplicationPipelineByIdPost(req: NextApiRequest, res: NextApiResponse) {
  if (!requireRef(req, res)) return
  return res.status(404).json({ message: 'Pipeline not found' })
}

export async function handleReplicationPipelineByIdDelete(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (!requireRef(req, res)) return
  return res.status(404).json({ message: 'Pipeline not found' })
}

export async function handleReplicationPipelineStatusGet(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (!requireRef(req, res)) return
  const pipelineId = parsePathInt(req, 'pipeline_id')
  return res.status(200).json({
    pipeline_id: pipelineId,
    status: { name: 'stopped' as const },
  })
}

export async function handleReplicationPipelineVersionGet(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (!requireRef(req, res)) return
  const pipelineId = parsePathInt(req, 'pipeline_id')
  return res.status(200).json({
    pipeline_id: pipelineId,
    version: { id: 1, name: 'v0.0.0' },
  })
}

export async function handleReplicationPipelineVersionPost(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (!requireRef(req, res)) return
  const pipelineId = parsePathInt(req, 'pipeline_id')
  return res.status(200).json({
    pipeline_id: pipelineId,
    version: { id: 1, name: 'v0.0.0' },
    new_version: { id: 2, name: 'v0.0.1' },
  })
}

export async function handleReplicationPipelineReplicationStatusGet(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (!requireRef(req, res)) return
  const pipelineId = parsePathInt(req, 'pipeline_id')
  return res.status(200).json({ pipeline_id: pipelineId, table_statuses: [] })
}

export async function handleReplicationPipelineActionPost(req: NextApiRequest, res: NextApiResponse) {
  if (!requireRef(req, res)) return
  return res.status(200).json({})
}

export async function handleReplicationPipelineRollbackPost(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (!requireRef(req, res)) return
  return res.status(200).json({})
}

export async function handleReplicationTenantSourcesPost(req: NextApiRequest, res: NextApiResponse) {
  if (!requireRef(req, res)) return
  return res.status(200).json({ source_id: 1, tenant_id: 'saas-stub' })
}

export async function handleReplicationDestinationPipelinesPost(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (!requireRef(req, res)) return
  return res.status(200).json({ destination_id: 1, pipeline_id: 1 })
}

export async function handleReplicationDestinationPipelinesByIdPost(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (!requireRef(req, res)) return
  return res.status(200).json({})
}

export async function handleReplicationDestinationPipelinesByIdDelete(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (!requireRef(req, res)) return
  return res.status(404).json({ message: 'Destination pipeline not found' })
}

export async function handleReplicationPublicationsGet(req: NextApiRequest, res: NextApiResponse) {
  if (!requireRef(req, res)) return
  return res.status(200).json({ publications: [] })
}

export async function handleReplicationPublicationsPost(req: NextApiRequest, res: NextApiResponse) {
  if (!requireRef(req, res)) return
  return res.status(200).json({})
}

export async function handleReplicationPublicationByNamePost(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (!requireRef(req, res)) return
  return res.status(200).json({})
}

export async function handleReplicationPublicationByNameDelete(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (!requireRef(req, res)) return
  return res.status(404).json({ message: 'Publication not found' })
}

export async function handleReplicationTablesGet(req: NextApiRequest, res: NextApiResponse) {
  if (!requireRef(req, res)) return
  return res.status(200).json({ tables: [] })
}
