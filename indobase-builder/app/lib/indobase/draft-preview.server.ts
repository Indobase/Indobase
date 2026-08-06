import { randomBytes } from 'node:crypto';

import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('draft-preview');

const DRAFT_TTL_MS = 60 * 60 * 1000; // 1 hour
const MAX_DRAFTS = 40;

export type DraftPreviewRecord = {
  createdAt: number;
  expiresAt: number;
  files: Record<string, string>;
  id: string;
};

const drafts = new Map<string, DraftPreviewRecord>();

function pruneExpiredDrafts(now = Date.now()) {
  for (const [id, draft] of drafts) {
    if (draft.expiresAt <= now) {
      drafts.delete(id);
    }
  }

  if (drafts.size <= MAX_DRAFTS) {
    return;
  }

  const oldest = [...drafts.values()].sort((a, b) => a.createdAt - b.createdAt);

  while (drafts.size > MAX_DRAFTS && oldest.length > 0) {
    const drop = oldest.shift();

    if (drop) {
      drafts.delete(drop.id);
    }
  }
}

function rewriteRootAbsoluteUrls(content: string, draftBase: string): string {
  const base = draftBase.replace(/\/+$/, '');

  return content
    .replace(/(\b(?:src|href|poster)=["'])\/(?!\/)/gi, `$1${base}/`)
    .replace(/(url\(\s*['"]?)\/(?!\/)/gi, `$1${base}/`);
}

export function storeDraftPreview(files: Record<string, string>): DraftPreviewRecord {
  pruneExpiredDrafts();

  if (!files['index.html'] && !Object.keys(files).some((path) => path.endsWith('/index.html'))) {
    throw new Error('Draft preview requires index.html');
  }

  const now = Date.now();
  const id = randomBytes(12).toString('hex');
  const draftBase = `/draft-preview/${id}`;
  const rewritten: Record<string, string> = {};

  for (const [path, content] of Object.entries(files)) {
    if (typeof content !== 'string') {
      continue;
    }

    const lower = path.toLowerCase();

    if (lower.endsWith('.html') || lower.endsWith('.css') || lower.endsWith('.js') || lower.endsWith('.mjs')) {
      rewritten[path] = rewriteRootAbsoluteUrls(content, draftBase);
    } else {
      rewritten[path] = content;
    }
  }

  const record: DraftPreviewRecord = {
    id,
    files: rewritten,
    createdAt: now,
    expiresAt: now + DRAFT_TTL_MS,
  };

  drafts.set(id, record);
  logger.info(`Stored draft preview ${id} (${Object.keys(rewritten).length} files)`);

  return record;
}

export function getDraftPreview(id: string): DraftPreviewRecord | undefined {
  pruneExpiredDrafts();

  const draft = drafts.get(id);

  if (!draft) {
    return undefined;
  }

  if (draft.expiresAt <= Date.now()) {
    drafts.delete(id);
    return undefined;
  }

  return draft;
}

export function resolveDraftPreviewFile(id: string, requestPath: string): { content: string; contentType: string } | null {
  const draft = getDraftPreview(id);

  if (!draft) {
    return null;
  }

  let relative = requestPath.replace(/^\/+/, '');

  if (!relative || relative.endsWith('/')) {
    relative = `${relative}index.html`.replace(/^\/+/, '');
  }

  if (relative.includes('..')) {
    return null;
  }

  const content =
    draft.files[relative] ??
    (relative === '' || relative === 'index.html' ? draft.files['index.html'] : undefined) ??
    draft.files[`/${relative}`];

  if (content == null) {
    return null;
  }

  return { content, contentType: guessContentType(relative) };
}

function guessContentType(filePath: string) {
  const lower = filePath.toLowerCase();

  if (lower.endsWith('.html')) return 'text/html; charset=utf-8';
  if (lower.endsWith('.css')) return 'text/css; charset=utf-8';
  if (lower.endsWith('.js') || lower.endsWith('.mjs')) return 'text/javascript; charset=utf-8';
  if (lower.endsWith('.json')) return 'application/json; charset=utf-8';
  if (lower.endsWith('.svg')) return 'image/svg+xml';
  if (lower.endsWith('.map')) return 'application/json; charset=utf-8';
  if (lower.endsWith('.txt')) return 'text/plain; charset=utf-8';
  if (lower.endsWith('.ico')) return 'image/x-icon';

  return 'application/octet-stream';
}

export function draftPreviewPublicUrl(id: string, requestOrigin?: string): string {
  const path = `/draft-preview/${id}/`;

  if (!requestOrigin) {
    return path;
  }

  return `${requestOrigin.replace(/\/+$/, '')}${path}`;
}
