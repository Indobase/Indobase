// Usage Analytics API
// Returns detailed usage metrics with cost calculations

import apiWrapper from 'lib/api/apiWrapper';
import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

export default (req: NextApiRequest, res: NextApiResponse) => 
  apiWrapper(req, res, handler);

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { method } = req;

  switch (method) {
    case 'GET':
      return await getUsageAnalytics(req, res);
    default:
      res.setHeader('Allow', ['GET']);
      res.status(405).json({ 
        error: { message: `Method ${method} Not Allowed` } 
      });
  }
}

async function getUsageAnalytics(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { ref, org_id, period = 'monthly', currency = 'INR' } = req.query;

    if (!org_id) {
      throw new Error('Organization ID is required');
    }

    // Initialize Supabase client
    const supabaseAdmin = createClient(
      process.env.SUPABASE_URL || '',
      process.env.SUPABASE_SERVICE_ROLE_KEY || ''
    );

    // Get current billing period
    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    // Fetch daily aggregates for the period
    const { data: dailyAggregates, error: aggError } = await supabaseAdmin
      .from('usage_daily_aggregates')
      .select(`
        metric_type,
        metric_name,
        total_value,
        day
      `)
      .eq('organization_id', org_id)
      .gte('day', periodStart.toISOString())
      .lte('day', periodEnd.toISOString());

    if (aggError) {
      throw new Error(`Failed to fetch usage data: ${aggError.message}`);
    }

    // Aggregate by metric type and name
    const aggregatedData = dailyAggregates.reduce((acc, item) => {
      const key = `${item.metric_type}-${item.metric_name}`;
      if (!acc[key]) {
        acc[key] = {
          metric_type: item.metric_type,
          metric_name: item.metric_name,
          total_value: 0,
          unit: getUnitForMetric(item.metric_type)
        };
      }
      acc[key].total_value += item.total_value;
      return acc;
    }, {} as Record<string, any>);

    // Fetch subscription plan and quotas
    const { data: subscription } = await supabaseAdmin
      .from('subscriptions')
      .select(`
        *,
        subscription_plans (
          included_quotas,
          overage_rates
        )
      `)
      .eq('organization_id', org_id)
      .eq('status', 'active')
      .single();

    // Calculate quotas and costs
    const usageWithQuotas = Object.values(aggregatedData).map((item: any) => {
      const planQuotas = subscription?.subscription_plans?.included_quotas || {};
      const overageRates = subscription?.subscription_plans?.overage_rates || {};
      
      const quotaLimit = planQuotas[item.metric_type];
      const overageRate = overageRates[item.metric_type] || 0;
      
      const isOverQuota = quotaLimit ? item.total_value > quotaLimit : false;
      const quotaUsedPercentage = quotaLimit ? (item.total_value / quotaLimit) * 100 : 0;
      
      // Calculate overage cost
      let estimatedCost = 0;
      if (isOverQuota && overageRate > 0) {
        const overageAmount = item.total_value - quotaLimit;
        estimatedCost = overageAmount * overageRate;
      }

      return {
        ...item,
        quota_limit: quotaLimit || null,
        quota_used_percentage: Math.min(quotaUsedPercentage, 100),
        is_over_quota: isOverQuota,
        estimated_cost: estimatedCost
      };
    });

    // If project ref is provided, filter by project
    let finalData = usageWithQuotas;
    if (ref) {
      // Fetch project-specific usage
      const { data: projectUsage } = await supabaseAdmin
        .from('usage_daily_aggregates')
        .select(`
          metric_type,
          metric_name,
          total_value
        `)
        .eq('project_ref', ref)
        .gte('day', periodStart.toISOString())
        .lte('day', periodEnd.toISOString());

      if (projectUsage) {
        // Merge project usage data
        finalData = mergeProjectUsage(usageWithQuotas, projectUsage);
      }
    }

    return res.status(200).json({
      data: finalData,
      period: {
        start: periodStart.toISOString(),
        end: periodEnd.toISOString()
      },
      currency,
      subscription: subscription ? {
        plan_name: subscription.plan_name,
        status: subscription.status
      } : null
    });

  } catch (error) {
    console.error('Error fetching usage analytics:', error);
    return res.status(500).json({
      error: { message: error.message }
    });
  }
}

// Helper functions

function getUnitForMetric(metricType: string): string {
  const units: Record<string, string> = {
    database_size: 'bytes',
    storage_size: 'bytes',
    auth_maus: 'count',
    functions_invocations: 'count',
    realtime_connections: 'count',
    realtime_messages: 'count',
    bandwidth: 'bytes',
    api_requests: 'count'
  };
  return units[metricType] || 'units';
}

function mergeProjectUsage(
  orgUsage: any[], 
  projectUsage: any[]
): any[] {
  // Aggregate project usage
  const projectAgg = projectUsage.reduce((acc, item) => {
    const key = `${item.metric_type}-${item.metric_name}`;
    acc[key] = (acc[key] || 0) + item.total_value;
    return acc;
  }, {} as Record<string, number>);

  // Update org usage with project percentages
  return orgUsage.map(item => {
    const key = `${item.metric_type}-${item.metric_name}`;
    const projectValue = projectAgg[key] || 0;
    const percentage = item.total_value > 0 
      ? (projectValue / item.total_value) * 100 
      : 0;

    return {
      ...item,
      project_value: projectValue,
      project_percentage: percentage,
      total_value: projectValue // Show only project value
    };
  });
}
