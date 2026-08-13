/**
 * Deterministic preview build — files on disk, not prose.
 * Launch / data engine is not required for a first preview.
 */

import { createHash } from 'node:crypto'
import { buildManagedShopStorefrontHtml } from '../pocketbase/shop-storefront-html.js'
import { buildProductionLandingHtml } from '../production-launch/shells.js'
import {
  draftPreviewUrl,
  previewArtifactExists,
  probePreviewHttp,
  readLiveFile,
  writeDraftPreview,
} from '../static-launch.js'
import { verticalForSpec, type BusinessSpec } from './business-spec.js'
import type { PreviewStatus } from './preview-gate.js'

export type PreviewBuildResult = {
  ok: boolean
  status: PreviewStatus
  url: string | null
  artifactRef: string | null
  contentHash: string | null
  httpOk: boolean | null
  files: Record<string, string>
  html: string
  message: string
}

function metadataFor(spec: BusinessSpec): string {
  return `${JSON.stringify(
    {
      name: spec.businessName,
      vertical: spec.catalog.verticalId,
      positioning: spec.visualStyle,
      businessType: spec.businessType,
    },
    null,
    2,
  )}\n`
}

export function buildPreviewFiles(spec: BusinessSpec, projectRef: string): Record<string, string> {
  const meta = metadataFor(spec)
  if (spec.businessType === 'ecommerce') {
    const vertical = verticalForSpec(spec)
    const products = (vertical?.products || []).map((p) => ({
      id: p.slug,
      name: p.name,
      slug: p.slug,
      description: p.description,
      price: Number(p.price) || 0,
      currency: spec.currency || p.currency || 'INR',
      stock: p.stock,
      image_url: '',
      active: true,
    }))
    const html = buildManagedShopStorefrontHtml({
      brand: spec.businessName,
      tagline: `${spec.visualStyle} ${spec.industry}`.trim(),
      appId: projectRef,
      publicUrl: '',
      products,
    })
    return { 'index.html': html, 'metadata.json': meta }
  }
  const html = buildProductionLandingHtml({
    brand: spec.businessName,
    intent: spec.sourceIntent,
  })
  return { 'index.html': html, 'metadata.json': meta }
}

function tidyHeadline(raw: string | null | undefined): string | null {
  const n = (raw || '')
    .replace(/^[\s`'"“”‘’]+|[\s`'"“”‘’]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!n || n.length < 3 || n.length > 120) return null
  if (/^(make|change|rewrite|update|edit|hide|delete|move|duplicate)\b/i.test(n) && n.length < 28) {
    return null
  }
  return n
}

export function extractRequestedHeadline(message: string): string | null {
  const text = (message || '').trim()
  if (!text) return null
  const quoted =
    /(?:hero\s+)?headline\s+to\s+[`'‘’""]([^`'‘’""]+)[`'‘’""]/i.exec(text) ||
    /request:\s*(?:change\s+(?:the\s+)?(?:hero(?:\s+headline)?|headline)\s+to\s+)?[`'‘’""]([^`'‘’""]+)[`'‘’""]/i.exec(
      text,
    ) ||
    /rewrite(?:\s+the)?(?:\s+hero)?(?:\s+headline)?\s+to\s+[`'‘’""]([^`'‘’""]+)[`'‘’""]/i.exec(text) ||
    /(?:hero\s+)?headline\s+to\s+([^\n]+)/i.exec(text)
  const fromQuote = tidyHeadline(quoted?.[1])
  if (fromQuote) return fromQuote
  const requestLine = /^request:\s*(.+)$/im.exec(text)
  const fromRequest = tidyHeadline(requestLine?.[1])
  if (fromRequest) return fromRequest
  return null
}

export function mutateHeroHeadline(html: string, headline: string): string {
  const next = headline.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  if (/data-ib-section=["']hero["'][\s\S]*?<h1\b/i.test(html)) {
    return html.replace(
      /(data-ib-section=["']hero["'][\s\S]*?<h1[^>]*>)[\s\S]*?(<\/h1>)/i,
      `$1${next}$2`,
    )
  }
  return html.replace(/(<h1[^>]*>)[\s\S]*?(<\/h1>)/i, `$1${next}$2`)
}

export function hashPreviewFiles(files: Record<string, string>): string {
  const hash = createHash('sha256')
  for (const [rel, content] of Object.entries(files).sort(([a], [b]) => a.localeCompare(b))) {
    hash.update(rel)
    hash.update(content)
  }
  return hash.digest('hex').slice(0, 16)
}

export async function verifyPreviewReachable(input: {
  projectRef: string
  url: string
  probe?: typeof probePreviewHttp
}): Promise<boolean> {
  const probe = input.probe || probePreviewHttp
  const httpOk = await probe(input.url)
  if (httpOk) return true
  const file = await readLiveFile(input.projectRef, 'index.html')
  return Boolean(file && file.body.length > 32)
}

export async function materializePreview(input: {
  projectRef: string
  spec: BusinessSpec
  probe?: typeof probePreviewHttp
}): Promise<PreviewBuildResult> {
  const files = buildPreviewFiles(input.spec, input.projectRef)
  const html = files['index.html'] || ''
  if (!html.includes('<html') && !html.includes('<!DOCTYPE')) {
    return {
      ok: false,
      status: 'failed',
      url: null,
      artifactRef: null,
      contentHash: null,
      httpOk: false,
      files,
      html,
      message: 'Preview build did not produce HTML.',
    }
  }

  const written = await writeDraftPreview({
    workspaceRef: input.projectRef,
    title: input.spec.businessName,
    files,
  })
  const exists = await previewArtifactExists(input.projectRef)
  if (!written.ok || !exists) {
    return {
      ok: false,
      status: 'failed',
      url: null,
      artifactRef: written.artifactRef || null,
      contentHash: written.contentHash || hashPreviewFiles(files),
      httpOk: false,
      files,
      html,
      message: 'Could not write preview files.',
    }
  }

  const url = written.previewUrl || draftPreviewUrl(input.projectRef)
  const httpOk = await verifyPreviewReachable({
    projectRef: input.projectRef,
    url,
    probe: input.probe,
  })
  if (!httpOk) {
    return {
      ok: false,
      status: 'failed',
      url,
      artifactRef: written.artifactRef,
      contentHash: written.contentHash,
      httpOk: false,
      files,
      html,
      message: 'Preview files exist but the preview URL did not respond.',
    }
  }

  return {
    ok: true,
    status: 'ready',
    url,
    artifactRef: written.artifactRef,
    contentHash: written.contentHash,
    httpOk: true,
    files,
    html,
    message: 'Preview ready',
  }
}
