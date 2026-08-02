import { handleError } from 'data/fetchers'

import { getDiscussClient, type DiscussClientVariables } from './discuss-client'
import type { DiscussAttachment } from './discuss.types'

export const DISCUSS_MAX_UPLOAD_BYTES = 25 * 1024 * 1024
export const DISCUSS_MAX_UPLOAD_FILES = 5

const SAFE_NAME = /[^a-zA-Z0-9._-]+/g

/** Must stay aligned with `storage.buckets.allowed_mime_types` for `discuss` (005 / ensure). */
export const DISCUSS_ALLOWED_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  'application/pdf',
  'text/plain',
  'text/csv',
  'application/zip',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
] as const

const EXT_TO_MIME: Record<string, (typeof DISCUSS_ALLOWED_MIME_TYPES)[number]> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  pdf: 'application/pdf',
  txt: 'text/plain',
  csv: 'text/csv',
  zip: 'application/zip',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
}

const ALLOWED_SET = new Set<string>(DISCUSS_ALLOWED_MIME_TYPES)

export function sanitizeDiscussFileName(name: string): string {
  const trimmed = name.trim().slice(0, 120) || 'file'
  return trimmed.replace(SAFE_NAME, '_').replace(/^\.+/, '_') || 'file'
}

/**
 * Resolve a Storage-allowed MIME type. Never falls back to `application/octet-stream`
 * (not on the discuss bucket allowlist).
 */
export function resolveDiscussUploadMimeType(file: Pick<File, 'name' | 'type'>): string {
  const declared = (file.type || '').trim().toLowerCase()
  if (ALLOWED_SET.has(declared)) return declared

  // Some browsers report jpeg as image/jpg
  if (declared === 'image/jpg') return 'image/jpeg'

  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  const fromExt = EXT_TO_MIME[ext]
  if (fromExt) return fromExt

  throw new Error(
    `"${file.name}" is not an allowed file type. Use images, PDF, text/CSV, zip, Word, or Excel.`
  )
}

export type DiscussUploadFileResult = {
  storagePath: string
  fileName: string
  mimeType: string
  sizeBytes: number
}

/**
 * Upload bytes to the project's `discuss` Storage bucket.
 * Paths are `{gotrueId}/{messageId}/{uuid}-{fileName}` so storage RLS can scope by JWT `sub`.
 */
export async function uploadDiscussFile({
  gotrueId,
  messageId,
  file,
  ...vars
}: DiscussClientVariables & {
  gotrueId: string
  messageId: string
  file: File
}): Promise<DiscussUploadFileResult> {
  if (file.size > DISCUSS_MAX_UPLOAD_BYTES) {
    throw new Error(`"${file.name}" is larger than 25 MB`)
  }

  const mimeType = resolveDiscussUploadMimeType(file)
  const client = getDiscussClient({ ...vars, gotrueId })
  const fileName = sanitizeDiscussFileName(file.name)
  const storagePath = `${gotrueId}/${messageId}/${crypto.randomUUID()}-${fileName}`

  const { error } = await client.storage.from('discuss').upload(storagePath, file, {
    contentType: mimeType,
    upsert: false,
  })
  if (error) handleError(error)

  return {
    storagePath,
    fileName,
    mimeType,
    sizeBytes: file.size,
  }
}

export async function insertDiscussAttachment({
  messageId,
  upload,
  ...vars
}: DiscussClientVariables & {
  messageId: string
  upload: DiscussUploadFileResult
}): Promise<DiscussAttachment> {
  const client = getDiscussClient(vars)
  const { data, error } = await client
    .from('attachments')
    .insert({
      message_id: messageId,
      storage_path: upload.storagePath,
      file_name: upload.fileName,
      mime_type: upload.mimeType,
      size_bytes: upload.sizeBytes,
    })
    .select('id, message_id, storage_path, file_name, mime_type, size_bytes, created_at')
    .single()

  if (error) handleError(error)
  return data as DiscussAttachment
}

/** Short-lived signed URL for rendering/downloading an attachment. */
export async function getDiscussAttachmentUrl({
  storagePath,
  ...vars
}: DiscussClientVariables & { storagePath: string }): Promise<string> {
  const client = getDiscussClient(vars)
  const { data, error } = await client.storage
    .from('discuss')
    .createSignedUrl(storagePath, 60 * 60)
  if (error) handleError(error)
  if (!data?.signedUrl) throw new Error('Could not create a download link')
  return data.signedUrl
}
