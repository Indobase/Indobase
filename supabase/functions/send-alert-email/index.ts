// Send Alert Email Edge Function
// Sends usage alert emails via Resend, SendGrid, or AWS SES

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { to, subject, data, currency = 'INR' } = await req.json();

    if (!to || !data) {
      throw new Error('Missing required parameters: to, subject, data');
    }

    const emailHtml = createAlertEmail(data, currency);

    // Use your preferred email service
    // Option 1: Resend (recommended)
    const resendResponse = await sendViaResend(to, subject, emailHtml);
    
    // Option 2: SendGrid
    // const sendgridResponse = await sendViaSendGrid(to, subject, emailHtml);
    
    // Option 3: AWS SES
    // const sesResponse = await sendViaSES(to, subject, emailHtml);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Email sent successfully'
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    console.error('Error sending email:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});

function createAlertEmail(data: any, currency: string = 'INR'): string {
  const isOverQuota = data.current_usage > data.quota_limit;
  const percentageUsed = ((data.current_usage / data.quota_limit) * 100).toFixed(2);
  
  const alertType = isOverQuota ? 'danger' : 'warning';
  const alertColor = isOverQuota ? '#EF4444' : '#F59E0B';
  const alertIcon = isOverQuota ? '🚨' : '⚠️';
  const alertTitle = isOverQuota ? 'Quota Exceeded' : 'Usage Alert';
  
  // Currency configuration
  const currencyConfig = getCurrencyConfig(currency);
  const estimatedCost = data.estimated_cost ? formatCurrency(data.estimated_cost, currency) : null;

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.6;
      color: #1f2937;
      margin: 0;
      padding: 0;
      background-color: #f3f4f6;
    }
    .container {
      max-width: 600px;
      margin: 40px auto;
      background: white;
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    }
    .header {
      background: linear-gradient(135deg, #3B82F6 0%, #2563EB 100%);
      color: white;
      padding: 32px;
      text-align: center;
    }
    .header h1 {
      margin: 0;
      font-size: 24px;
      font-weight: 600;
    }
    .content {
      padding: 32px;
    }
    .alert-box {
      background-color: ${alertColor}15;
      border-left: 4px solid ${alertColor};
      padding: 20px;
      margin: 20px 0;
      border-radius: 4px;
    }
    .alert-title {
      color: ${alertColor};
      font-size: 18px;
      font-weight: 600;
      margin-bottom: 8px;
    }
    .metric-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 16px;
      margin: 24px 0;
    }
    .metric-card {
      background: #f9fafb;
      padding: 16px;
      border-radius: 6px;
    }
    .metric-label {
      font-size: 12px;
      color: #6b7280;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: 4px;
    }
    .metric-value {
      font-size: 20px;
      font-weight: 600;
      color: #111827;
    }
    .progress-bar {
      width: 100%;
      height: 12px;
      background-color: #e5e7eb;
      border-radius: 6px;
      overflow: hidden;
      margin: 16px 0;
    }
    .progress-fill {
      height: 100%;
      background: linear-gradient(90deg, #3B82F6 0%, ${isOverQuota ? '#EF4444' : '#F59E0B'} 100%);
      width: ${Math.min(100, parseFloat(percentageUsed))}%;
      transition: width 0.3s ease;
    }
    .cta-button {
      display: inline-block;
      background-color: #3B82F6;
      color: white;
      text-decoration: none;
      padding: 12px 32px;
      border-radius: 6px;
      font-weight: 600;
      margin: 24px 0;
      text-align: center;
    }
    .cta-button:hover {
      background-color: #2563EB;
    }
    .footer {
      background-color: #f9fafb;
      padding: 24px 32px;
      border-top: 1px solid #e5e7eb;
      font-size: 14px;
      color: #6b7280;
    }
    .footer a {
      color: #3B82F6;
      text-decoration: none;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>${alertIcon} ${alertTitle}</h1>
    </div>
    
    <div class="content">
      <p>Hello,</p>
      
      <p>Your project <strong>${data.project_ref}</strong> has reached <strong>${percentageUsed}%</strong> of its quota for <strong>${formatMetricName(data.metric_name)}</strong>.</p>
      
      <div class="alert-box">
        <div class="alert-title">${alertTitle}</div>
        <p style="margin: 0;">
          Current usage has ${isOverQuota ? 'exceeded' : 'almost reached'} the limit for your current plan.
          ${isOverQuota ? 'Immediate action is required.' : 'Consider upgrading your plan to avoid service interruption.'}
        </p>
      </div>

      <div class="metric-grid">
        <div class="metric-card">
          <div class="metric-label">Current Usage</div>
          <div class="metric-value">${formatValue(data.current_usage, data.unit)}</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Quota Limit</div>
          <div class="metric-value">${formatValue(data.quota_limit, data.unit)}</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Period</div>
          <div class="metric-value">${formatDate(data.period_start)} - ${formatDate(data.period_end)}</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Enforcement</div>
          <div class="metric-value" style="text-transform: capitalize;">${data.enforcement}</div>
        </div>
      </div>

      <div class="progress-bar">
        <div class="progress-fill"></div>
      </div>
      <p style="text-align: center; color: #6b7280; font-size: 14px;">
        ${percentageUsed}% used
      </p>

      ${isOverQuota && estimatedCost ? `
        <div style="background-color: #FEF2F2; border: 1px solid #FCA5A5; padding: 16px; border-radius: 6px; margin: 20px 0;">
          <strong style="color: #DC2626;">💰 Estimated Overage Cost</strong>
          <p style="margin: 8px 0 0 0; color: #991B1B; font-size: 14px;">
            Based on your current overage, the estimated additional charge is:
          </p>
          <p style="margin: 8px 0 0 0; font-size: 24px; font-weight: bold; color: #DC2626;">
            ${estimatedCost}
          </p>
          <p style="margin: 8px 0 0 0; color: #991B1B; font-size: 12px;">
            ${currency === 'INR' ? '* Includes 18% GST where applicable' : '* Taxes may apply'}
          </p>
        </div>
      ` : ''}

      ${isOverQuota && !estimatedCost ? `
        <div style="background-color: #FEF2F2; border: 1px solid #FCA5A5; padding: 16px; border-radius: 6px; margin: 20px 0;">
          <strong style="color: #DC2626;">⚠️ Service Impact</strong>
          <p style="margin: 8px 0 0 0; color: #991B1B; font-size: 14px;">
            Your usage has exceeded the plan limits. This may result in:
          </p>
          <ul style="margin: 8px 0 0 0; padding-left: 20px; color: #991B1B; font-size: 14px;">
            <li>Blocked API requests (HTTP 429)</li>
            <li>Additional overage charges</li>
            <li>Service degradation</li>
          </ul>
        </div>
      ` : ''}

      <a href="${process.env.DASHBOARD_URL}/project/${data.project_ref}/usage?currency=${currency.toLowerCase()}" class="cta-button">
        View Usage Dashboard (${currency})
      </a>

      <h3 style="margin-top: 32px;">Recommended Actions:</h3>
      <ol style="line-height: 2;">
        <li>Review your usage patterns in the dashboard</li>
        <li>${isOverQuota ? 'Upgrade your plan immediately to restore full access' : 'Consider upgrading to prevent overage charges'}</li>
        <li>Optimize your resource consumption</li>
        <li>Set up additional alerts for early warnings</li>
      </ol>
    </div>

    <div class="footer">
      <p>
        You're receiving this email because you configured usage alerts for your organization.
      </p>
      <p>
        <a href="${process.env.DASHBOARD_URL}/settings/alerts">Manage Alert Settings</a> • 
        <a href="${process.env.DASHBOARD_URL}">Go to Dashboard</a> • 
        <a href="${process.env.DOCS_URL}/usage-tracking">Learn More</a>
      </p>
      <p style="margin-top: 16px; font-size: 12px; color: #9ca3af;">
        © ${new Date().getFullYear()} Your Platform. All rights reserved.<br/>
        ${currency === 'INR' ? 'Prices are in Indian Rupees (₹) and include 18% GST where applicable.' : ''}
      </p>
      ${data.organization_name ? `
      <p style="margin-top: 8px; font-size: 11px; color: #9ca3af;">
        ${data.organization_name}<br/>
        ${data.gstin ? `GSTIN: ${data.gstin}<br/>` : ''}
      </p>
      ` : ''}
    </div>
  </div>
</body>
</html>
  `.trim();
}

// Currency configuration helper
function getCurrencyConfig(currency: string) {
  const configs: Record<string, { symbol: string; locale: string; name: string }> = {
    INR: { symbol: '₹', locale: 'en-IN', name: 'Indian Rupee' },
    USD: { symbol: '$', locale: 'en-US', name: 'US Dollar' },
    EUR: { symbol: '€', locale: 'de-DE', name: 'Euro' },
    GBP: { symbol: '£', locale: 'en-GB', name: 'British Pound' }
  };
  return configs[currency] || configs.INR;
}

// Format currency values
function formatCurrency(amount: number, currency: string): string {
  const config = getCurrencyConfig(currency);
  
  if (currency === 'INR') {
    // Indian numbering system (lakhs and crores)
    if (amount >= 10000000) {
      return `₹${(amount / 10000000).toFixed(2)} Cr`;
    }
    if (amount >= 100000) {
      return `₹${(amount / 100000).toFixed(2)} L`;
    }
  }
  
  return `${config.symbol}${amount.toLocaleString(config.locale, { 
    minimumFractionDigits: 2, 
    maximumFractionDigits: 2 
  })}`;
}

async function sendViaResend(to: string, subject: string, html: string) {
  const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
  
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: Deno.env.get('EMAIL_FROM') || 'Usage Alerts <alerts@yourplatform.com>',
      to: [to],
      subject: subject,
      html: html,
    }),
  });

  if (!response.ok) {
    throw new Error(`Resend error: ${await response.text()}`);
  }

  return response;
}

async function sendViaSendGrid(to: string, subject: string, html: string) {
  const SENDGRID_API_KEY = Deno.env.get('SENDGRID_API_KEY');
  
  const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SENDGRID_API_KEY}`,
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: to }] }],
      from: { email: Deno.env.get('EMAIL_FROM') || 'alerts@yourplatform.com' },
      subject: subject,
      content: [{ type: 'text/html', value: html }],
    }),
  });

  if (!response.ok && response.status !== 202) {
    throw new Error(`SendGrid error: ${await response.text()}`);
  }

  return response;
}

async function sendViaSES(to: string, subject: string, html: string) {
  const AWS_REGION = Deno.env.get('AWS_REGION');
  const AWS_ACCESS_KEY_ID = Deno.env.get('AWS_ACCESS_KEY_ID');
  const AWS_SECRET_ACCESS_KEY = Deno.env.get('AWS_SECRET_ACCESS_KEY');
  
  // Implement AWS SES integration
  // You'll need to use AWS SDK for Deno
  console.log('Sending via SES:', { to, subject });
  
  return { ok: true };
}

// Utility functions
function formatMetricName(name: string): string {
  return name
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function formatValue(value: number, unit: string, currency: string = 'INR'): string {
  if (unit === 'bytes') {
    const gb = value / (1024 * 1024 * 1024);
    if (gb >= 1) return `${gb.toFixed(2)} GB`;
    const mb = value / (1024 * 1024);
    if (mb >= 1) return `${mb.toFixed(2)} MB`;
    const kb = value / 1024;
    return `${kb.toFixed(2)} KB`;
  }
  if (unit === 'count') {
    if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
    if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
    return value.toString();
  }
  return `${value.toLocaleString(getCurrencyConfig(currency).locale)} ${unit}`;
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
}
