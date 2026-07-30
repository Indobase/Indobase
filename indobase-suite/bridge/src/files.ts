/**
 * Per-project file store for Indobase Workspace.
 * Layout: {DATA_DIR}/{projectRef}/index.json + {id}.bin
 */
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export type WorkspaceFileKind = 'doc' | 'sheet' | 'slide' | 'file'

export type WorkspaceFileMeta = {
  id: string
  name: string
  kind: WorkspaceFileKind
  ext: string
  size: number
  createdAt: string
  updatedAt: string
  createdBy: string
}

type ProjectIndex = { files: WorkspaceFileMeta[] }

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const TEMPLATE_DIR = path.resolve(__dirname, '../templates')

export function dataRoot(): string {
  return (process.env.WORKSPACE_DATA_DIR || path.resolve(__dirname, '../.data')).replace(/\/+$/, '')
}

function projectDir(projectRef: string): string {
  const safe = projectRef.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64) || 'default'
  return path.join(dataRoot(), safe)
}

function indexPath(projectRef: string): string {
  return path.join(projectDir(projectRef), 'index.json')
}

function blobPath(projectRef: string, id: string): string {
  return path.join(projectDir(projectRef), `${id}.bin`)
}

async function ensureProject(projectRef: string): Promise<void> {
  await fs.mkdir(projectDir(projectRef), { recursive: true })
}

async function readIndex(projectRef: string): Promise<ProjectIndex> {
  await ensureProject(projectRef)
  try {
    const raw = await fs.readFile(indexPath(projectRef), 'utf8')
    const parsed = JSON.parse(raw) as ProjectIndex
    return { files: Array.isArray(parsed.files) ? parsed.files : [] }
  } catch {
    return { files: [] }
  }
}

async function writeIndex(projectRef: string, index: ProjectIndex): Promise<void> {
  await ensureProject(projectRef)
  await fs.writeFile(indexPath(projectRef), JSON.stringify(index, null, 2), 'utf8')
}

const KIND_EXT: Record<WorkspaceFileKind, string> = {
  doc: 'docx',
  sheet: 'xlsx',
  slide: 'pptx',
  file: 'bin',
}

const EXT_KIND: Record<string, WorkspaceFileKind> = {
  docx: 'doc',
  doc: 'doc',
  odt: 'doc',
  xlsx: 'sheet',
  xls: 'sheet',
  ods: 'sheet',
  csv: 'sheet',
  pptx: 'slide',
  ppt: 'slide',
  odp: 'slide',
}

export function kindFromExt(ext: string): WorkspaceFileKind {
  return EXT_KIND[ext.toLowerCase()] || 'file'
}

export function documentTypeForExt(ext: string): 'word' | 'cell' | 'slide' {
  const kind = kindFromExt(ext)
  if (kind === 'sheet') return 'cell'
  if (kind === 'slide') return 'slide'
  return 'word'
}

async function templateBytes(kind: WorkspaceFileKind): Promise<Buffer> {
  const name =
    kind === 'sheet' ? 'blank.xlsx' : kind === 'slide' ? 'blank.pptx' : 'blank.docx'
  return fs.readFile(path.join(TEMPLATE_DIR, name))
}

export async function listFiles(
  projectRef: string,
  filterKind?: WorkspaceFileKind
): Promise<WorkspaceFileMeta[]> {
  const index = await readIndex(projectRef)
  const files = [...index.files].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  if (!filterKind || filterKind === 'file') return files
  return files.filter((f) => f.kind === filterKind)
}

export async function getFile(
  projectRef: string,
  id: string
): Promise<WorkspaceFileMeta | null> {
  const index = await readIndex(projectRef)
  return index.files.find((f) => f.id === id) ?? null
}

export async function readFileBytes(projectRef: string, id: string): Promise<Buffer | null> {
  try {
    return await fs.readFile(blobPath(projectRef, id))
  } catch {
    return null
  }
}

export async function createFile(opts: {
  projectRef: string
  name: string
  kind: WorkspaceFileKind
  createdBy: string
  bytes?: Buffer
}): Promise<WorkspaceFileMeta> {
  const ext = KIND_EXT[opts.kind] || 'bin'
  const id = randomBytes(12).toString('hex')
  const now = new Date().toISOString()
  const bytes = opts.bytes ?? (await templateBytes(opts.kind === 'file' ? 'doc' : opts.kind))
  const name = opts.name.endsWith(`.${ext}`) ? opts.name : `${opts.name}.${ext}`
  const meta: WorkspaceFileMeta = {
    id,
    name,
    kind: opts.kind === 'file' ? kindFromExt(ext) : opts.kind,
    ext,
    size: bytes.length,
    createdAt: now,
    updatedAt: now,
    createdBy: opts.createdBy,
  }
  await ensureProject(opts.projectRef)
  await fs.writeFile(blobPath(opts.projectRef, id), bytes)
  const index = await readIndex(opts.projectRef)
  index.files.push(meta)
  await writeIndex(opts.projectRef, index)
  return meta
}

export async function saveFileBytes(
  projectRef: string,
  id: string,
  bytes: Buffer
): Promise<WorkspaceFileMeta | null> {
  const index = await readIndex(projectRef)
  const meta = index.files.find((f) => f.id === id)
  if (!meta) return null
  await fs.writeFile(blobPath(projectRef, id), bytes)
  meta.size = bytes.length
  meta.updatedAt = new Date().toISOString()
  await writeIndex(projectRef, index)
  return meta
}

export async function deleteFile(projectRef: string, id: string): Promise<boolean> {
  const index = await readIndex(projectRef)
  const next = index.files.filter((f) => f.id !== id)
  if (next.length === index.files.length) return false
  await writeIndex(projectRef, { files: next })
  try {
    await fs.unlink(blobPath(projectRef, id))
  } catch {
    /* ignore missing blob */
  }
  return true
}

/** Short-lived HMAC token so DocumentServer can fetch/save without browser cookies. */
export function mintFileAccessToken(
  secret: string,
  projectRef: string,
  fileId: string,
  ttlSeconds = 60 * 60 * 6
): string {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds
  const payload = `${projectRef}.${fileId}.${exp}`
  const sig = createHmac('sha256', secret).update(payload).digest('base64url')
  return `${payload}.${sig}`
}

export function verifyFileAccessToken(
  secret: string,
  token: string
): { projectRef: string; fileId: string } | null {
  const parts = token.split('.')
  if (parts.length !== 4) return null
  const [projectRef, fileId, expStr, sig] = parts
  const exp = Number(expStr)
  if (!projectRef || !fileId || !Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) {
    return null
  }
  const payload = `${projectRef}.${fileId}.${expStr}`
  const expected = createHmac('sha256', secret).update(payload).digest('base64url')
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  return { projectRef, fileId }
}
