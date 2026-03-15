// Usage Aggregation Service
// Runs hourly/daily to aggregate raw metrics into billing-ready data

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    );

    const url = new URL(req.url);
    const aggregationType = url.searchParams.get('type') || 'all'; // hourly, daily, monthly
    const targetDate = url.searchParams.get('date'); // Optional: specific date to process

    const results = {
      hourly: false,
      daily: false,
      monthly: false,
    };

    if (aggregationType === 'all' || aggregationType === 'hourly') {
      await aggregateHourlyMetrics(supabaseClient, targetDate);
      results.hourly = true;
    }

    if (aggregationType === 'all' || aggregationType === 'daily') {
      await aggregateDailyMetrics(supabaseClient, targetDate);
      results.daily = true;
    }

    if (aggregationType === 'all' || aggregationType === 'monthly') {
      await aggregateMonthlyBilling(supabaseClient, targetDate);
      results.monthly = true;
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        aggregation: results,
        processed_at: new Date().toISOString()
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    console.error('Error aggregating usage:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});

// ============================================================================
// HOURLY AGGREGATION
// ============================================================================

async function aggregateHourlyMetrics(supabaseClient: any, targetDate?: string) {
  console.log('Starting hourly aggregation...');

  const hourStart = targetDate 
    ? new Date(targetDate)
    : new Date();
  
  hourStart.setUTCMinutes(0, 0, 0); // Round to start of current hour

  // Get raw metrics from the last hour
  const { data: rawMetrics } = await supabaseClient
    .from('usage_metrics')
    .select('*')
    .gte('timestamp', hourStart.toISOString())
    .lt('timestamp', new Date(hourStart.getTime() + 3600000).toISOString());

  if (!rawMetrics || rawMetrics.length === 0) {
    console.log('No raw metrics found for this hour');
    return;
  }

  // Group by project, metric_type, metric_name
  const grouped = groupMetrics(rawMetrics);

  // Insert aggregated hourly records
  const hourlyRecords = Object.entries(grouped).map(([key, metrics]) => {
    const [project_id, metric_type, metric_name] = key.split('|');
    const values = metrics.map(m => m.metric_value);
    
    return {
      project_id,
      organization_id: metrics[0].organization_id,
      metric_type,
      metric_name,
      hour_start: hourStart.toISOString(),
      metric_value: calculateMetricValue(metric_name, values),
      unit: metrics[0].unit,
      sample_count: values.length,
      min_value: Math.min(...values),
      max_value: Math.max(...values),
      avg_value: values.reduce((a, b) => a + b, 0) / values.length,
      metadata: {
        aggregated_from: 'usage_metrics',
        sample_count: values.length
      }
    };
  });

  // Upsert hourly records
  for (const record of hourlyRecords) {
    await supabaseClient
      .from('usage_hourly')
      .upsert(record, {
        onConflict: 'project_id,metric_type,metric_name,hour_start'
      });
  }

  console.log(`Aggregated ${hourlyRecords.length} hourly metrics`);
}

// ============================================================================
// DAILY AGGREGATION
// ============================================================================

async function aggregateDailyMetrics(supabaseClient: any, targetDate?: string) {
  console.log('Starting daily aggregation...');

  const dayStart = targetDate 
    ? new Date(targetDate)
    : new Date();
  
  dayStart.setUTCHours(0, 0, 0, 0); // Start of day
  const dayEnd = new Date(dayStart);
  dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);

  // Get hourly metrics for this day
  const { data: hourlyMetrics } = await supabaseClient
    .from('usage_hourly')
    .select('*')
    .gte('hour_start', dayStart.toISOString())
    .lt('hour_start', dayEnd.toISOString());

  if (!hourlyMetrics || hourlyMetrics.length === 0) {
    console.log('No hourly metrics found for this day');
    return;
  }

  // Group by project, metric_type, metric_name
  const grouped = groupMetrics(hourlyMetrics);

  // Create daily aggregates
  const dailyRecords = Object.entries(grouped).map(([key, metrics]) => {
    const [project_id, metric_type, metric_name] = key.split('|');
    const values = metrics.map(m => m.metric_value);
    
    return {
      project_id,
      organization_id: metrics[0].organization_id,
      metric_type,
      metric_name,
      day: dayStart.toISOString().split('T')[0],
      metric_value: calculateDailyMetricValue(metric_name, metrics),
      unit: metrics[0].unit,
      sample_count: values.length,
      min_value: Math.min(...values),
      max_value: Math.max(...values),
      avg_value: values.reduce((a, b) => a + b, 0) / values.length,
      peak_value: Math.max(...values),
      metadata: {
        aggregated_from: 'usage_hourly',
        hours_sampled: values.length
      }
    };
  });

  // Upsert daily records
  for (const record of dailyRecords) {
    await supabaseClient
      .from('usage_daily')
      .upsert(record, {
        onConflict: 'project_id,metric_type,metric_name,day'
      });
  }

  console.log(`Aggregated ${dailyRecords.length} daily metrics`);
}

// ============================================================================
// MONTHLY BILLING AGGREGATION
// ============================================================================

async function aggregateMonthlyBilling(supabaseClient: any, targetDate?: string) {
  console.log('Starting monthly billing aggregation...');

  const monthDate = targetDate 
    ? new Date(targetDate)
    : new Date();
  
  const monthStart = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  const nextMonth = new Date(monthStart);
  nextMonth.setMonth(nextMonth.getMonth() + 1);

  // Get all daily metrics for the month
  const { data: dailyMetrics } = await supabaseClient
    .from('usage_daily')
    .select('*')
    .gte('day', monthStart.toISOString())
    .lt('day', nextMonth.toISOString());

  if (!dailyMetrics || dailyMetrics.length === 0) {
    console.log('No daily metrics found for this month');
    return;
  }

  // Get subscription plans for quota calculations
  const { data: subscriptions } = await supabaseClient
    .from('subscriptions')
    .select(`
      *,
      subscription_plans (
        name,
        included_quotas,
        overage_rates
      )
    `)
    .eq('status', 'active');

  const subscriptionMap = new Map(
    subscriptions?.map(s => [s.organization_id, s]) || []
  );

  // Group by organization and metric
  const groupedByOrg = groupBy(dailyMetrics, 'organization_id');

  const monthlyRecords = [];

  for (const [orgId, orgMetrics] of Object.entries(groupedByOrg)) {
    const subscription = subscriptionMap.get(orgId);
    const plan = subscription?.subscription_plans;
    
    const includedQuotas = plan?.included_quotas || {};
    const overageRates = plan?.overage_rates || {};

    // Group by project and metric
    const groupedByProject = groupBy(orgMetrics, 'project_id');

    for (const [projectId, projectMetrics] of Object.entries(groupedByProject)) {
      const groupedByType = groupBy(projectMetrics, 'metric_type');

      for (const [metricType, typeMetrics] of Object.entries(groupedByType)) {
        const groupedByName = groupBy(typeMetrics, 'metric_name');

        for (const [metricName, nameMetrics] of Object.entries(groupedByName)) {
          const totalValue = nameMetrics.reduce((sum, m) => sum + parseFloat(String(m.metric_value)), 0);
          const unit = nameMetrics[0].unit;

          // Calculate included quota and overage
          const quotaKey = `${metricType}_${metricName}`;
          const includedInPlan = parseFloat(String(includedQuotas[quotaKey] || 0));
          const overageRate = parseFloat(String(overageRates[quotaKey] || 0));
          
          const billableValue = Math.max(0, totalValue - includedInPlan);
          const overageCost = billableValue * overageRate;

          monthlyRecords.push({
            project_id: projectId,
            organization_id: orgId,
            month: monthStart.toISOString().split('T')[0],
            metric_type: metricType,
            metric_name: metricName,
            total_value: totalValue,
            unit,
            included_in_plan: includedInPlan,
            billable_value: billableValue,
            overage_rate: overageRate,
            overage_cost: overageCost,
            metadata: {
              plan_name: plan?.name || 'free',
              days_in_month: nameMetrics.length,
              average_daily_usage: totalValue / nameMetrics.length
            }
          });
        }
      }
    }
  }

  // Upsert monthly records
  for (const record of monthlyRecords) {
    await supabaseClient
      .from('usage_monthly')
      .upsert(record, {
        onConflict: 'project_id,organization_id,month,metric_type,metric_name'
      });
  }

  console.log(`Aggregated ${monthlyRecords.length} monthly billing records`);
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function groupMetrics(metrics: any[]): Record<string, any[]> {
  const grouped: Record<string, any[]> = {};
  
  for (const metric of metrics) {
    const key = `${metric.project_id}|${metric.metric_type}|${metric.metric_name}`;
    if (!grouped[key]) {
      grouped[key] = [];
    }
    grouped[key].push(metric);
  }
  
  return grouped;
}

function groupBy(array: any[], key: string): Record<string, any[]> {
  return array.reduce((result, item) => {
    const groupKey = item[key];
    if (!result[groupKey]) {
      result[groupKey] = [];
    }
    result[groupKey].push(item);
    return result;
  }, {});
}

function calculateMetricValue(metricName: string, values: number[]): number {
  // Different metrics need different aggregation strategies
  if (metricName.includes('size') || metricName.includes('bytes')) {
    // For size metrics, use the maximum (peak usage)
    return Math.max(...values);
  } else if (metricName.includes('connections')) {
    // For connections, use peak
    return Math.max(...values);
  } else {
    // For count metrics (requests, invocations), sum them up
    return values.reduce((a, b) => a + b, 0);
  }
}

function calculateDailyMetricValue(metricName: string, hourlyMetrics: any[]): number {
  const values = hourlyMetrics.map(m => parseFloat(String(m.metric_value)));
  
  if (metricName.includes('size') || metricName.includes('bytes')) {
    // Use daily peak
    return Math.max(...values);
  } else if (metricName.includes('connections')) {
    // Use peak concurrent connections
    return Math.max(...values);
  } else {
    // Sum up hourly counts for daily total
    return values.reduce((a, b) => a + b, 0);
  }
}
