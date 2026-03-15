# Usage Tracking System for BaaS/IaaS Platform

A comprehensive usage tracking, metering, and billing system built on top of Indobase/Supabase.

## 📋 Overview

This system provides:

- ✅ **Real-time usage collection** from all services (Database, Auth, Storage, Functions, Realtime)
- ✅ **Multi-tier aggregation** (hourly → daily → monthly)
- ✅ **Quota management** with soft/hard enforcement
- ✅ **Billing calculations** with overage tracking
- ✅ **Alert system** (email, webhook, Slack)
- ✅ **Dashboard UI** for usage visualization
- ✅ **Export capabilities** (CSV, JSON)

## 🏗️ Architecture

```
┌─────────────────┐
│  Services       │
│  - Database     │
│  - Auth         │
│  - Storage      │
│  - Functions    │
│  - Realtime     │
└────────┬────────┘
         │
         │ Raw Metrics (every minute)
         ▼
┌─────────────────┐
│ usage_metrics   │ ← Raw time-series data
│ (partitioned)   │
└────────┬────────┘
         │
         │ Hourly Aggregation
         ▼
┌─────────────────┐
│ usage_hourly    │ ← Hourly aggregates
└────────┬────────┘
         │
         │ Daily Aggregation
         ▼
┌─────────────────┐
│ usage_daily     │ ← Daily aggregates
└────────┬────────┘
         │
         │ Monthly Billing
         ▼
┌─────────────────┐
│ usage_monthly   │ ← Billing summaries
│ + invoices      │
└─────────────────┘
```

## 🚀 Quick Start

### 1. Install the Schema

Run the migration in your Supabase project:

```bash
supabase db push
```

Or apply manually via SQL Editor in Supabase Dashboard.

### 2. Deploy Edge Functions

```bash
# Deploy usage collector
supabase functions deploy usage-collector

# Deploy usage aggregator
supabase functions deploy usage-aggregator

# Deploy quota enforcer
supabase functions deploy quota-enforcer
```

### 3. Configure Cron Jobs

Set up automated collection and aggregation:

```bash
# In crontab or your scheduler

# Collect raw metrics every minute
* * * * * curl -X POST "https://your-project.supabase.co/functions/v1/usage-collector?type=all"

# Aggregate hourly (at minute 5 of each hour)
5 * * * * curl -X POST "https://your-project.supabase.co/functions/v1/usage-aggregator?type=hourly"

# Aggregate daily (at 1 AM UTC)
0 1 * * * curl -X POST "https://your-project.supabase.co/functions/v1/usage-aggregator?type=daily"

# Aggregate monthly (on 1st of month at 2 AM UTC)
0 2 1 * * curl -X POST "https://your-project.supabase.co/functions/v1/usage-aggregator?type=monthly"

# Check quotas every 5 minutes
*/5 * * * * curl -X POST "https://your-project.supabase.co/functions/v1/quota-enforcer"
```

### 4. Set Up Subscription Plans

The schema includes default plans (Free, Pro, Team, Enterprise). Customize them:

```sql
-- Update included quotas for Pro plan
UPDATE subscription_plans 
SET included_quotas = '{
  "database_size": 8589934592,
  "auth_maus": 100000,
  "storage_size": 107374182400
}'::jsonb
WHERE name = 'pro';

-- Update overage rates
UPDATE subscription_plans 
SET overage_rates = '{
  "database_size": 0.000000125,
  "auth_maus": 0.00325
}'::jsonb
WHERE name = 'pro';
```

## 📊 Metrics Collected

### Database
- `database_size` - Total database size in bytes
- `api_requests` - Number of API requests
- `active_connections` - Current database connections

### Authentication
- `total_users` - Total users in system
- `mau` - Monthly active users
- `sign_ins` - Sign-in count
- `mfa_users` - Users with MFA enabled

### Storage
- `storage_size` - Total storage used in bytes
- `object_count` - Number of objects stored
- `egress_bytes` - Bandwidth used
- `image_transformations` - Image transformation count

### Edge Functions
- `invocations` - Function invocation count
- `compute_duration` - Total compute time in ms
- `invocations_by_function` - Breakdown per function

### Realtime
- `peak_connections` - Peak concurrent connections
- `messages` - Message count
- `postgres_changes` - Active subscriptions

## 🔧 Configuration

### Quota Enforcement

Quotas can be enforced in two modes:

1. **Soft Enforcement** (`soft`)
   - Allows overages
   - Sends warnings
   - Charges overage fees

2. **Hard Enforcement** (`hard`)
   - Blocks usage after limit
   - Returns 429 Too Many Requests
   - Requires manual intervention

Configure per metric:

```sql
INSERT INTO quotas (plan_id, metric_type, metric_name, limit_value, unit, enforcement)
VALUES 
  ('pro-plan-uuid', 'database', 'database_size', 8589934592, 'bytes', 'soft'),
  ('pro-plan-uuid', 'auth', 'mau', 100000, 'count', 'soft'),
  ('free-plan-uuid', 'functions', 'invocations', 500000, 'count', 'hard');
```

### Alert Configuration

Users can configure alerts:

```sql
INSERT INTO usage_alerts (
  organization_id, 
  metric_type, 
  metric_name, 
  threshold_percentage,
  alert_channels,
  webhook_url
) VALUES (
  'org-uuid',
  'database',
  'database_size',
  80.00, -- Alert at 80%
  '["email", "slack"]',
  'https://hooks.slack.com/...'
);
```

## 📱 Dashboard Integration

Add the Usage Dashboard to your Studio app:

```tsx
import { UsageDashboard } from 'components/Usage/UsageDashboard';

export default function UsagePage() {
  return (
    <UsageDashboard 
      projectRef="your-project-ref"
      organizationId="your-org-id"
    />
  );
}
```

## 💰 Billing Calculation

Monthly billing is calculated automatically:

```sql
-- View current month's billing
SELECT 
  metric_type,
  metric_name,
  total_value,
  included_in_plan,
  billable_value,
  overage_rate,
  overage_cost
FROM usage_monthly
WHERE organization_id = 'your-org-id'
  AND month = DATE_TRUNC('month', CURRENT_DATE);
```

### Example Invoice Generation

```sql
-- Generate invoice for current month
INSERT INTO invoices (
  organization_id,
  invoice_number,
  period_start,
  period_end,
  subtotal,
  tax,
  total,
  status,
  line_items
)
SELECT 
  organization_id,
  'INV-' || TO_CHAR(CURRENT_DATE, 'YYYY-MM') || '-' || LPAD(ROW_NUMBER() OVER ()::text, 6, '0'),
  DATE_TRUNC('month', CURRENT_DATE),
  (DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month - 1 day')::date,
  SUM(overage_cost),
  SUM(overage_cost) * 0.1, -- 10% tax
  SUM(overage_cost) * 1.1,
  'draft',
  jsonb_agg(jsonb_build_object(
    'description', metric_name,
    'quantity', billable_value,
    'unit_price', overage_rate,
    'amount', overage_cost
  ))
FROM usage_monthly
WHERE month = DATE_TRUNC('month', CURRENT_DATE)
GROUP BY organization_id;
```

## 🔍 API Endpoints

### Get Usage Analytics

```typescript
GET /api/platform/usage/analytics?ref=PROJECT_REF&period=daily&metric_type=database
```

Response:
```json
{
  "data": [
    {
      "metric_type": "database",
      "metric_name": "database_size",
      "total_value": 1234567890,
      "unit": "bytes",
      "quota_limit": 8589934592,
      "quota_used_percentage": 14.37,
      "is_over_quota": false,
      "estimated_cost": 0
    }
  ],
  "period": "daily",
  "count": 1
}
```

### Export Usage Data

```typescript
POST /api/platform/usage/analytics
Content-Type: application/json

{
  "org_id": "org-uuid",
  "format": "csv",
  "period": "monthly",
  "month": "2024-01"
}
```

Returns CSV file download.

## ⚠️ Quota Enforcement Flow

```
User Request
    ↓
Check Quota (via middleware)
    ↓
┌─────────────┐
│ Under Limit │ → Allow Request
└─────────────┘
         ↓
    Over Limit?
         ↓
    ┌────┴────┐
    │         │
  Soft      Hard
    │         │
    │         └──→ Block (429)
    │
    └──→ Allow + Charge Overage
         Send Alert
```

### Implementing Middleware

```typescript
// middleware/quotaCheck.ts
export async function checkQuotaMiddleware(req: Request, next: NextFunction) {
  const projectRef = req.headers['x-project-ref'];
  
  const response = await fetch(
    `${SUPABASE_URL}/functions/v1/quota-enforcer?project_ref=${projectRef}`,
    { method: 'POST' }
  );
  
  const result = await response.json();
  
  if (result.violations.some(v => v.enforcement === 'hard')) {
    return res.status(429).json({
      error: 'Quota exceeded',
      message: 'Your usage has exceeded the plan limits. Please upgrade your plan.'
    });
  }
  
  next();
}
```

## 📈 Scaling Considerations

### Database Partitioning

The `usage_metrics` table should be partitioned by timestamp:

```sql
-- Create monthly partitions
CREATE TABLE usage_metrics_2024_01 PARTITION OF usage_metrics
FOR VALUES FROM ('2024-01-01') TO ('2024-02-01');

CREATE TABLE usage_metrics_2024_02 PARTITION OF usage_metrics
FOR VALUES FROM ('2024-02-01') TO ('2024-03-01');
```

### Data Retention

Set up retention policies:

```sql
-- Delete raw metrics older than 90 days
DELETE FROM usage_metrics 
WHERE timestamp < NOW() - INTERVAL '90 days';

-- Delete hourly aggregates older than 1 year
DELETE FROM usage_hourly 
WHERE hour_start < NOW() - INTERVAL '1 year';

-- Keep daily/monthly indefinitely for billing history
```

## 🔐 Security

### Row Level Security (RLS)

All tables have RLS policies:

```sql
-- Organizations can only see their own data
CREATE POLICY "Org members can view usage"
ON usage_metrics FOR SELECT
USING (
  organization_id IN (
    SELECT organization_id 
    FROM organization_members 
    WHERE user_id = auth.uid()
  )
);

-- Service role can insert/update all
CREATE POLICY "Service role full access"
ON usage_metrics FOR ALL
USING (auth.jwt()->>'role' = 'service_role');
```

## 🧪 Testing

### Test Data Generation

```sql
-- Generate test usage data
INSERT INTO usage_metrics (project_id, organization_id, metric_type, metric_name, metric_value, unit)
SELECT 
  p.id,
  p.organization_id,
  m.metric_type,
  m.metric_name,
  random() * 1000000,
  'count'
FROM projects p
CROSS JOIN (
  VALUES 
    ('database', 'api_requests'),
    ('auth', 'mau'),
    ('storage', 'object_count')
) AS m(metric_type, metric_name)
WHERE p.ref = 'test-project'
AND generate_series(
  NOW() - INTERVAL '30 days',
  NOW(),
  INTERVAL '1 hour'
);
```

## 🎯 Best Practices

1. **Collect frequently, aggregate periodically**
   - Collect raw metrics every minute
   - Aggregate hourly to reduce query load
   - Calculate billing monthly

2. **Use appropriate precision**
   - Raw metrics: 6 decimal places
   - Costs: 2 decimal places
   - Percentages: 2 decimal places

3. **Implement backpressure**
   - If collection fails, don't retry infinitely
   - Use exponential backoff
   - Log failures for debugging

4. **Monitor the monitor**
   - Set up alerts for collection failures
   - Track data quality metrics
   - Verify aggregation completeness

## 📝 Migration Guide

If migrating from another system:

1. Export existing usage data
2. Transform to match schema
3. Import into `usage_metrics`
4. Run aggregation manually
5. Verify totals match

## 🆘 Troubleshooting

### Common Issues

**Issue: Missing metrics**
- Check cron jobs are running
- Verify Edge Function permissions
- Check logs for errors

**Issue: Incorrect billing**
- Verify quota configuration
- Check aggregation logic
- Review overage rate calculations

**Issue: Performance problems**
- Add indexes on timestamp columns
- Implement partitioning
- Increase aggregation frequency

## 📚 Additional Resources

- [Supabase Edge Functions Docs](https://supabase.com/docs/guides/functions)
- [PostgreSQL Time-Series Best Practices](https://www.postgresql.org/docs/current/)
- [Stripe Billing Integration](https://stripe.com/docs/billing)

## 🤝 Contributing

Contributions welcome! Please read our contributing guidelines first.

## 📄 License

Apache 2.0 License
