// Usage Analytics API
// Returns detailed usage metrics with cost calculations

import type { JwtPayload } from '@indobaseinc/indobase-js'
import apiWrapper from 'lib/api/apiWrapper'
import { setNoStore } from 'lib/api/no-store'
import { getGotrueUserId } from 'lib/api/saas/platform'
import { executeQuery } from 'lib/api/saas/query'
import { getStorageAdminClient } from 'lib/api/storage-admin'
import { NextApiRequest, NextApiResponse } from 'next'

export default (req: NextApiRequest, res: NextApiResponse) =>
  apiWrapper(req, res, handler, { withAuth: true })

async function handler(req: NextApiRequest, res: NextApiResponse, claims?: JwtPayload) {
  setNoStore(res)
  const { method } = req

  switch (method) {
    case 'GET':
      return await getUsageAnalytics(req, res, claims)
    default:
      res.setHeader('Allow', ['GET'])
      res.status(405).json({
        error: { message: `Method ${method} Not Allowed` },
      })
  }
}

async function getUsageAnalytics(
  req: NextApiRequest,
  res: NextApiResponse,
  claims?: JwtPayload
) {
  try {
    const { ref, org_id, period = 'monthly', currency = 'INR' } = req.query

    if (!org_id || typeof org_id !== 'string') {
      throw new Error('Organization ID is required')
    }

    const organizationId = Number.parseInt(org_id, 10)
    if (!Number.isFinite(organizationId) || organizationId <= 0) {
      return res.status(400).json({ error: { message: 'Invalid organization ID' } })
    }

    const gotrueId = getGotrueUserId(claims as JwtPayload)
    const membership = await executeQuery<{ organization_id: number }>({
      query: `
        select m.organization_id
        from saas.organization_members m
        where m.organization_id = $1 and m.gotrue_id = $2
        limit 1
      `,
      parameters: [organizationId, gotrueId],
      actorId: gotrueId,
    })
    if (membership.error) throw membership.error
    if (!membership.data?.[0]) {
      return res.status(403).json({ error: { message: 'Forbidden' } })
    }

    if (ref && typeof ref === 'string') {
      const projectAccess = await executeQuery<{ ref: string }>({
        query: `
          select p.ref
          from saas.projects p
          where p.ref = $1 and p.organization_id = $2
          limit 1
        `,
        parameters: [ref, organizationId],
        actorId: gotrueId,
      })
      if (projectAccess.error) throw projectAccess.error
      if (!projectAccess.data?.[0]) {
        return res.status(403).json({ error: { message: 'Project does not belong to this organization' } })
      }
    }

    const supabaseAdmin = getStorageAdminClient()

    const now = new Date()
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0)

    const { data: dailyAggregates, error: aggError } = await supabaseAdmin
      .from('usage_daily_aggregates')
      .select(`
        metric_type,
        metric_name,
        total_value,
        day
      `)
      .eq('organization_id', organizationId)
      .gte('day', periodStart.toISOString())
      .lte('day', periodEnd.toISOString())

    if (aggError) {
      throw new Error(`Failed to fetch usage data: ${aggError.message}`)
    }

    const aggregatedData = dailyAggregates.reduce((acc, item) => {
      const key = `${item.metric_type}-${item.metric_name}`
      if (!acc[key]) {
        acc[key] = {
          metric_type: item.metric_type,
          metric_name: item.metric_name,
          total_value: 0,
          unit: getUnitForMetric(item.metric_type),
        }
      }
      acc[key].total_value += item.total_value
      return acc
    }, {} as Record<string, any>)

    const { data: subscription } = await supabaseAdmin
      .from('subscriptions')
      .select(`
        *,
        subscription_plans (
          included_quotas,
          overage_rates
        )
      `)
      .eq('organization_id', organizationId)
      .eq('status', 'active')
      .single()

    const usageWithQuotas = Object.values(aggregatedData).map((item: any) => {
      const planQuotas = subscription?.subscription_plans?.included_quotas || {}
      const overageRates = subscription?.subscription_plans?.overage_rates || {}

      const quotaLimit = planQuotas[item.metric_type]
      const overageRate = overageRates[item.metric_type] || 0

      const isOverQuota = quotaLimit ? item.total_value > quotaLimit : false
      const quotaUsedPercentage = quotaLimit ? (item.total_value / quotaLimit) * 100 : 0

      let estimatedCost = 0
      if (isOverQuota && overageRate > 0) {
        const overageAmount = item.total_value - quotaLimit
        estimatedCost = overageAmount * overageRate
      }

      return {
        ...item,
        quota_limit: quotaLimit || null,
        quota_used_percentage: Math.min(quotaUsedPercentage, 100),
        is_over_quota: isOverQuota,
        estimated_cost: estimatedCost,
      }
    })

    let finalData = usageWithQuotas
    if (ref && typeof ref === 'string') {
      const { data: projectUsage } = await supabaseAdmin
        .from('usage_daily_aggregates')
        .select(`
          metric_type,
          metric_name,
          total_value
        `)
        .eq('project_ref', ref)
        .gte('day', periodStart.toISOString())
        .lte('day', periodEnd.toISOString())

      if (projectUsage) {
        finalData = mergeProjectUsage(usageWithQuotas, projectUsage)
      }
    }

    return res.status(200).json({
      data: finalData,
      period: {
        start: periodStart.toISOString(),
        end: periodEnd.toISOString(),
      },
      currency,
      subscription: subscription
        ? {
            plan_name: subscription.plan_name,
            status: subscription.status,
          }
        : null,
    })
  } catch (error) {
    console.error('Error fetching usage analytics:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return res.status(500).json({
      error: { message },
    })
  }
}

function getUnitForMetric(metricType: string): string {
  const units: Record<string, string> = {
    database_size: 'bytes',
    storage_size: 'bytes',
    auth_maus: 'count',
    functions_invocations: 'count',
    realtime_connections: 'count',
    realtime_messages: 'count',
    bandwidth: 'bytes',
    api_requests: 'count',
  }
  return units[metricType] || 'units'
}

function mergeProjectUsage(orgUsage: any[], projectUsage: any[]): any[] {
  const projectAgg = projectUsage.reduce((acc, item) => {
    const key = `${item.metric_type}-${item.metric_name}`
    acc[key] = (acc[key] || 0) + item.total_value
    return acc
  }, {} as Record<string, number>)

  return orgUsage.map((item) => {
    const key = `${item.metric_type}-${item.metric_name}`
    const projectValue = projectAgg[key] || 0
    const percentage = item.total_value > 0 ? (projectValue / item.total_value) * 100 : 0

    return {
      ...item,
      project_value: projectValue,
      project_percentage: percentage,
      total_value: projectValue,
    }
  })
}
