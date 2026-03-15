// Quota Enforcement Service
// Checks quotas and enforces limits (soft/hard)

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
    const projectRef = url.searchParams.get('project_ref');
    const metricType = url.searchParams.get('metric_type');
    const metricName = url.searchParams.get('metric_name');

    // Check all quotas or specific metric
    let violations = [];

    if (metricType && metricName && projectRef) {
      // Check specific metric
      const violation = await checkQuota(supabaseClient, projectRef, metricType, metricName);
      if (violation) {
        violations.push(violation);
      }
    } else {
      // Check all quotas for project
      const allViolations = await checkAllQuotas(supabaseClient, projectRef);
      violations = allViolations;
    }

    // Process violations
    for (const violation of violations) {
      await handleQuotaViolation(supabaseClient, violation);
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        violations,
        enforced: violations.length > 0
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    console.error('Error enforcing quotas:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});

async function checkQuota(
  supabaseClient: any, 
  projectRef: string, 
  metricType: string, 
  metricName: string
): Promise<any | null> {
  // Get project info
  const { data: project } = await supabaseClient
    .from('projects')
    .select('id, organization_id')
    .eq('ref', projectRef)
    .single();

  if (!project) {
    throw new Error('Project not found');
  }

  // Get current period's quota usage
  const now = new Date();
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

  const { data: quotaUsage } = await supabaseClient
    .from('quota_usage')
    .select(`
      *,
      quotas (
        limit_value,
        enforcement,
        reset_period
      )
    `)
    .eq('project_id', project.id)
    .eq('metric_type', metricType)
    .eq('metric_name', metricName)
    .gte('period_start', periodStart.toISOString())
    .lte('period_end', periodEnd.toISOString())
    .single();

  if (!quotaUsage) {
    return null; // No quota tracking set up
  }

  const limit = quotaUsage.quotas.limit_value;
  const current = quotaUsage.current_usage;
  const percentageUsed = (current / limit) * 100;

  // Check if over quota
  if (current > limit) {
    return {
      project_id: project.id,
      project_ref: projectRef,
      organization_id: project.organization_id,
      metric_type: metricType,
      metric_name: metricName,
      current_usage: current,
      quota_limit: limit,
      percentage_used: percentageUsed,
      enforcement: quotaUsage.quotas.enforcement,
      period_start: periodStart,
      period_end: periodEnd
    };
  }

  // Check if approaching quota (80% threshold)
  if (percentageUsed >= 80) {
    return {
      project_id: project.id,
      project_ref: projectRef,
      organization_id: project.organization_id,
      metric_type: metricType,
      metric_name: metricName,
      current_usage: current,
      quota_limit: limit,
      percentage_used: percentageUsed,
      enforcement: 'warning',
      period_start: periodStart,
      period_end: periodEnd
    };
  }

  return null;
}

async function checkAllQuotas(supabaseClient: any, projectRef: string | null): Promise<any[]> {
  if (!projectRef) {
    throw new Error('Project ref required');
  }

  // Get all active quotas for this project
  const { data: quotas } = await supabaseClient
    .from('quotas')
    .select('*');

  const violations = [];

  for (const quota of quotas || []) {
    const violation = await checkQuota(
      supabaseClient, 
      projectRef, 
      quota.metric_type, 
      quota.metric_name
    );
    
    if (violation) {
      violations.push(violation);
    }
  }

  return violations;
}

async function handleQuotaViolation(supabaseClient: any, violation: any) {
  console.log('Handling quota violation:', violation);

  // 1. Log the violation
  await supabaseClient.from('alert_history').insert({
    alert_id: null,
    project_id: violation.project_id,
    organization_id: violation.organization_id,
    metric_type: violation.metric_type,
    metric_name: violation.metric_name,
    triggered_value: violation.current_usage,
    threshold_value: violation.quota_limit,
    percentage_used: violation.percentage_used,
    notification_sent: false,
    notification_channels: ['system']
  });

  // 2. Send alerts based on enforcement type
  if (violation.enforcement === 'soft' || violation.enforcement === 'warning') {
    // Send warning notification but don't block
    await sendWarningNotification(supabaseClient, violation);
  } else if (violation.enforcement === 'hard') {
    // Block further usage
    await enforceHardLimit(supabaseClient, violation);
  }

  // 3. Update quota usage record
  await supabaseClient
    .from('quota_usage')
    .update({
      is_over_quota: violation.current_usage > violation.quota_limit,
      percentage_used: violation.percentage_used,
      last_checked: new Date().toISOString()
    })
    .eq('project_id', violation.project_id)
    .eq('metric_type', violation.metric_type)
    .eq('metric_name', violation.metric_name);
}

async function sendWarningNotification(supabaseClient: any, violation: any) {
  // Get alert configuration
  const { data: alerts } = await supabaseClient
    .from('usage_alerts')
    .select('*')
    .eq('organization_id', violation.organization_id)
    .eq('metric_type', violation.metric_type)
    .eq('metric_name', violation.metric_name)
    .eq('is_active', true);

  for (const alert of alerts || []) {
    // Send notifications through configured channels
    const channels = alert.alert_channels || ['email'];

    if (channels.includes('email')) {
      await sendEmailAlert(supabaseClient, alert, violation);
    }

    if (channels.includes('webhook') && alert.webhook_url) {
      await sendWebhookAlert(alert.webhook_url, violation);
    }

    if (channels.includes('slack')) {
      await sendSlackAlert(alert.webhook_url, violation);
    }

    // Update last triggered timestamp
    await supabaseClient
      .from('usage_alerts')
      .update({ last_triggered_at: new Date().toISOString() })
      .eq('id', alert.id);
  }
}

async function enforceHardLimit(supabaseClient: any, violation: any) {
  // Implement service-specific blocking
  // This is a placeholder - actual implementation depends on your architecture
  
  console.log('ENFORCING HARD LIMIT:', {
    action: 'block_service',
    project: violation.project_ref,
    metric: `${violation.metric_type}.${violation.metric_name}`,
    reason: 'Quota exceeded'
  });

  // Example actions:
  // 1. Set a flag in Redis to block API requests
  // 2. Update Kong configuration to rate limit
  // 3. Pause database connections
  // 4. Disable storage uploads
  
  // This should integrate with your gateway/service mesh
}

async function sendEmailAlert(supabaseClient: any, alert: any, violation: any) {
  // Use Supabase Edge Functions to send email
  const { error } = await supabaseClient.functions.invoke('send-alert-email', {
    body: {
      to: alert.organization_id, // Get actual email from org
      subject: `Usage Alert: ${formatMetricName(violation.metric_name)} at ${violation.percentage_used.toFixed(1)}%`,
      data: violation
    }
  });

  if (error) {
    console.error('Error sending email alert:', error);
  }
}

async function sendWebhookAlert(webhookUrl: string, violation: any) {
  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event: 'quota_violation',
        timestamp: new Date().toISOString(),
        data: violation
      })
    });
  } catch (error) {
    console.error('Error sending webhook alert:', error);
  }
}

async function sendSlackAlert(webhookUrl: string, violation: any) {
  const slackMessage = {
    text: '🚨 Usage Alert',
    attachments: [{
      color: violation.current_usage > violation.quota_limit ? 'danger' : 'warning',
      fields: [
        {
          title: 'Project',
          value: violation.project_ref,
          short: true
        },
        {
          title: 'Metric',
          value: formatMetricName(violation.metric_name),
          short: true
        },
        {
          title: 'Current Usage',
          value: violation.current_usage.toString(),
          short: true
        },
        {
          title: 'Quota Limit',
          value: violation.quota_limit.toString(),
          short: true
        },
        {
          title: 'Percentage Used',
          value: `${violation.percentage_used.toFixed(1)}%`,
          short: false
        }
      ]
    }]
  };

  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(slackMessage)
    });
  } catch (error) {
    console.error('Error sending Slack alert:', error);
  }
}

function formatMetricName(name: string): string {
  return name
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
