import { FileText, Paperclip, X } from 'lucide-react'
import { useEffect, useState } from 'react'

import type { DiscussAttachment } from 'data/discuss/discuss.types'
import { getDiscussAttachmentUrl } from 'data/discuss/discuss-upload'
import { useDiscussConnection } from 'data/discuss/discuss-connection'
import { cn } from 'ui'

import { DISCUSS_FOCUS_RING } from './Discuss.constants'

function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

interface AttachmentChipProps {
  attachment: DiscussAttachment
  projectRef?: string
}

export const AttachmentChip = ({ attachment, projectRef }: AttachmentChipProps) => {
  const { connection } = useDiscussConnection({ projectRef })
  const [url, setUrl] = useState<string | null>(null)
  const [error, setError] = useState(false)
  const isImage = attachment.mime_type.startsWith('image/')

  useEffect(() => {
    let cancelled = false
    if (!connection.gotrueId || !connection.endpoint || !connection.apiKey) return

    void getDiscussAttachmentUrl({ ...connection, storagePath: attachment.storage_path })
      .then((signed) => {
        if (!cancelled) setUrl(signed)
      })
      .catch(() => {
        if (!cancelled) setError(true)
      })

    return () => {
      cancelled = true
    }
  }, [attachment.storage_path, connection])

  if (isImage && url) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className={cn('mt-2 block max-w-sm overflow-hidden rounded-md border', DISCUSS_FOCUS_RING)}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt={attachment.file_name}
          className="max-h-64 w-full object-contain bg-surface-200"
        />
      </a>
    )
  }

  return (
    <a
      href={url ?? undefined}
      target="_blank"
      rel="noreferrer"
      aria-disabled={!url || error}
      className={cn(
        'mt-2 inline-flex max-w-full items-center gap-2 rounded-md border bg-surface-100 px-2.5 py-1.5 text-xs',
        DISCUSS_FOCUS_RING,
        (!url || error) && 'pointer-events-none opacity-60'
      )}
    >
      {isImage ? <Paperclip size={12} /> : <FileText size={12} />}
      <span className="truncate">{attachment.file_name}</span>
      <span className="shrink-0 text-foreground-lighter">{formatBytes(attachment.size_bytes)}</span>
    </a>
  )
}

interface PendingFilesProps {
  files: File[]
  onRemove: (index: number) => void
}

export const PendingFiles = ({ files, onRemove }: PendingFilesProps) => {
  if (files.length === 0) return null
  return (
    <ul className="mb-2 flex flex-wrap gap-2">
      {files.map((file, index) => (
        <li
          key={`${file.name}-${file.size}-${index}`}
          className="inline-flex max-w-full items-center gap-1.5 rounded-md border bg-background px-2 py-1 text-xs"
        >
          <Paperclip size={12} className="shrink-0" />
          <span className="truncate">{file.name}</span>
          <button
            type="button"
            aria-label={`Remove ${file.name}`}
            className={cn('rounded p-0.5 hover:bg-surface-200', DISCUSS_FOCUS_RING)}
            onClick={() => onRemove(index)}
          >
            <X size={12} />
          </button>
        </li>
      ))}
    </ul>
  )
}
