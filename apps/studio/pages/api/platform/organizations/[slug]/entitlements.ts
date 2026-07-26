import type { JwtPayload } from '@indobaseinc/indobase-js'
import type { NextApiRequest, NextApiResponse } from 'next'

import apiWrapper from 'lib/api/apiWrapper'
import { setNoStore } from 'lib/api/no-store'
import { executeQuery } from 'lib/api/saas/query'
import { getPlanEntitlements, canonicalizePlanId } from 'lib/api/saas/plan-entitlements'

export default (req: NextApiRequest, res: NextApiResponse) =>
  apiWrapper(req, res, handler, { withAuth: true })

async function handler(req: NextApiRequest, res: NextApiResponse, _claims?: JwtPayload) {
  setNoStore(res)
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET'])
    return res.status(405).json({ message: 'Method not allowed' })
  }
  const slug = typeof req.query.slug === 'string' ? req.query.slug : ''
  if (!slug) return res.status(400).json({ message: 'Organization slug is required' })

  const rows = await executeQuery<{ plan: string }>({
    query: `select plan from saas.organizations where slug = $1 limit 1`,
    parameters: [slug],
  })
  if (rows.error) return res.status(500).json({ message: rows.error.message })
  if (!rows.data?.length) return res.status(404).json({ message: 'Organization not found' })

  const plan = canonicalizePlanId(rows.data[0].plan)
  const e = getPlanEntitlements(plan)

  return res.status(200).json({
    plan: {
      id: plan,
      name: e.displayName,
      price_inr: e.priceInr,
    },
    entitlements: [
      {
        feature: { key: 'max_apps' },
        type: 'numeric',
        hasAccess: true,
        config: { enabled: true, unlimited: e.maxApps == null, value: e.maxApps ?? 0 },
      },
      {
        feature: { key: 'max_seats' },
        type: 'numeric',
        hasAccess: true,
        config: { enabled: true, unlimited: e.maxSeats == null, value: e.maxSeats ?? 0 },
      },
      {
        feature: { key: 'builds_per_day' },
        type: 'numeric',
        hasAccess: true,
        config: { enabled: true, unlimited: e.buildsPerDay == null, value: e.buildsPerDay ?? 0 },
      },
      {
        feature: { key: 'custom_domain' },
        type: 'boolean',
        hasAccess: e.customDomain,
        config: { enabled: e.customDomain },
      },
      {
        feature: { key: 'backend_studio' },
        type: 'boolean',
        hasAccess: e.backendStudio,
        config: { enabled: e.backendStudio },
      },
      {
        feature: { key: 'github_export' },
        type: 'boolean',
        hasAccess: e.githubExport,
        config: { enabled: e.githubExport },
      },
      {
        feature: { key: 'priority_build_queue' },
        type: 'boolean',
        hasAccess: e.priorityBuildQueue,
        config: { enabled: e.priorityBuildQueue },
      },
      {
        feature: { key: 'indobase_badge' },
        type: 'boolean',
        hasAccess: e.showIndobaseBadge,
        config: { enabled: e.showIndobaseBadge },
      },
      {
        feature: { key: 'idle_sleep_days' },
        type: 'numeric',
        hasAccess: e.idleSleepDays != null,
        config: { enabled: e.idleSleepDays != null, unlimited: false, value: e.idleSleepDays ?? 0 },
      },
    ],
    features: {
      custom_domain: e.customDomain,
      backend_studio: e.backendStudio,
      github_export: e.githubExport,
      priority_build_queue: e.priorityBuildQueue,
      show_indobase_badge: e.showIndobaseBadge,
      isolated_stack: e.isolatedStack,
      shared_billing: e.sharedBilling,
    },
    limits: {
      max_apps: e.maxApps,
      max_seats: e.maxSeats,
      builds_per_day: e.buildsPerDay,
      database_bytes: e.databaseBytes,
      builder_prompt_limit: e.builderPromptLimit,
      video_ai_limit: e.videoAiLimit,
      idle_sleep_days: e.idleSleepDays,
    },
  })
}
