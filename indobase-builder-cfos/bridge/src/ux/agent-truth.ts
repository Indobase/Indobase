/**
 * Authoritative state the agent must speak from.
 * UI, Control Center, and chat consume the same snapshot — never two truths.
 */

import type { BusinessSpec } from './business-spec.js'
import type { PreviewStatus } from './preview-gate.js'

export type BusinessSnapshotSummary = {
  products: Array<{ id?: string; name?: string; priceMinor?: number }>
  orders: Array<{
    id?: string
    orderNumber?: string
    status?: string
    payment_status?: string
    amount_minor?: number
    email?: string
  }>
}

export type AuthoritativeTruth = {
  projectState: string
  previewStatus: PreviewStatus
  previewUrl: string | null
  liveUrl: string | null
  catalogReady: boolean
  spec?: BusinessSpec | null
  snapshot?: BusinessSnapshotSummary | null
}

export function composeAuthoritativeStateHint(truth: AuthoritativeTruth): string {
  const spec = truth.spec
  const snap = truth.snapshot
  const productLines = (snap?.products || []).slice(0, 8).map((p) => `- ${p.name || p.id}`)
  const orderLines = (snap?.orders || []).slice(0, 8).map((o) => {
    const id = o.orderNumber || o.id || '?'
    const status = o.payment_status || o.status || ''
    return `- #${id} ${status}`.trim()
  })
  const lines = [
    '## Authoritative state (HARD — speak only from this)',
    `project.state: ${truth.projectState}`,
    `preview.status: ${truth.previewStatus}`,
    `preview.url: ${truth.previewUrl || 'none'}`,
    `live.url: ${truth.liveUrl || 'none'}`,
    `catalog.ready: ${truth.catalogReady ? 'yes' : 'no'}`,
  ]
  if (spec) {
    lines.push(
      `business.spec: ${spec.businessName} / ${spec.businessType} / ${spec.catalog.category} / ${spec.visualStyle} / ${spec.currency}`,
    )
    lines.push(
      'Honor BusinessSpec. Do not substitute a generic apparel catalog when the spec is sneakers (or any other niche).',
    )
  }
  if (productLines.length) {
    lines.push('products (from BusinessSnapshot):')
    lines.push(...productLines)
  }
  if (orderLines.length) {
    lines.push('orders (from BusinessSnapshot):')
    lines.push(...orderLines)
  }
  lines.push(
    [
      'Rules:',
      '- Never describe a preview as available unless preview.status is ready.',
      '- Never claim LIVE unless project.state is live and live.url is set.',
      '- Never say the launch service, catalog, or orders connection is unavailable when this block lists them.',
      '- Launch / Go Live / “Launch my store on Indobase now.” → immediately call launchProductionApp with this BusinessSpec. Do not ask the operator to refresh.',
      '- After sign-in: continue the original request. Do not ask them to wait or refresh.',
      '- SCREEN show-order: answer from the snapshot above. SCREEN add-product after LIVE: call setupShopCatalog with the new item, then confirm from the snapshot.',
      '- If a tool fails, quote the humanized failure and offer Fix it automatically. Never invent “service unavailable”.',
    ].join('\n'),
  )
  return lines.join('\n')
}

export function agentMayClaimPreview(truth: AuthoritativeTruth): boolean {
  return truth.previewStatus === 'ready' && Boolean(truth.previewUrl)
}

export function agentMayClaimLive(truth: AuthoritativeTruth): boolean {
  return truth.projectState === 'live' && Boolean(truth.liveUrl)
}
