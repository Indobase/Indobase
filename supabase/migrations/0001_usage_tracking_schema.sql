-- Usage Tracking Schema for BaaS/IaaS Platform
-- This migration creates comprehensive usage tracking infrastructure

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- CORE USAGE TRACKING TABLES
-- ============================================================================

-- 1. Organizations and Projects (multi-tenancy foundation)
CREATE TABLE IF NOT EXISTS public.organizations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    stripe_customer_id TEXT UNIQUE,
    billing_email TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_organizations_slug ON public.organizations(slug);
CREATE INDEX idx_organizations_stripe_customer_id ON public.organizations(stripe_customer_id);

CREATE TABLE IF NOT EXISTS public.projects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    ref TEXT UNIQUE NOT NULL, -- Project reference (e.g., "abcdefghijklmnopqrst")
    region TEXT NOT NULL,
    plan TEXT NOT NULL DEFAULT 'free', -- free, pro, team, enterprise
    status TEXT NOT NULL DEFAULT 'active', -- active, paused, deleted
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_projects_organization_id ON public.projects(organization_id);
CREATE INDEX idx_projects_ref ON public.projects(ref);
CREATE INDEX idx_projects_plan ON public.projects(plan);

-- 2. Subscription Plans and Pricing
CREATE TABLE IF NOT EXISTS public.subscription_plans (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL UNIQUE, -- free, pro, team, enterprise
    display_name TEXT NOT NULL,
    stripe_price_id TEXT,
    monthly_base_price DECIMAL(10, 2) DEFAULT 0,
    currency TEXT DEFAULT 'USD',
    included_quotas JSONB NOT NULL DEFAULT '{}', -- Quotas included in base price
    overage_rates JSONB NOT NULL DEFAULT '{}', -- Per-unit rates for overages
    features JSONB NOT NULL DEFAULT '[]',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_subscription_plans_name ON public.subscription_plans(name);

-- 3. Active Subscriptions
CREATE TABLE IF NOT EXISTS public.subscriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    plan_id UUID REFERENCES public.subscription_plans(id),
    stripe_subscription_id TEXT UNIQUE,
    status TEXT NOT NULL, -- active, past_due, canceled, trialing
    current_period_start TIMESTAMPTZ,
    current_period_end TIMESTAMPTZ,
    cancel_at_period_end BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(organization_id, plan_id)
);

CREATE INDEX idx_subscriptions_organization_id ON public.subscriptions(organization_id);
CREATE INDEX idx_subscriptions_status ON public.subscriptions(status);

-- ============================================================================
-- USAGE METRICS COLLECTION TABLES
-- ============================================================================

-- 4. Raw Usage Metrics (time-series data)
CREATE TABLE IF NOT EXISTS public.usage_metrics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    metric_type TEXT NOT NULL, -- database, auth, storage, functions, realtime
    metric_name TEXT NOT NULL, -- specific metric (e.g., "database_size", "mau", "storage_bytes")
    metric_value DECIMAL(20, 6) NOT NULL,
    unit TEXT NOT NULL, -- bytes, count, seconds, requests, etc.
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    metadata JSONB DEFAULT '{}', -- Additional context (region, bucket name, etc.)
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Partition by timestamp for performance (monthly partitions)
CREATE INDEX idx_usage_metrics_project_timestamp ON public.usage_metrics(project_id, timestamp DESC);
CREATE INDEX idx_usage_metrics_organization_timestamp ON public.usage_metrics(organization_id, timestamp DESC);
CREATE INDEX idx_usage_metrics_type_name_timestamp ON public.usage_metrics(metric_type, metric_name, timestamp DESC);

-- 5. Hourly Aggregated Usage
CREATE TABLE IF NOT EXISTS public.usage_hourly (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    metric_type TEXT NOT NULL,
    metric_name TEXT NOT NULL,
    hour_start TIMESTAMPTZ NOT NULL,
    metric_value DECIMAL(20, 6) NOT NULL,
    unit TEXT NOT NULL,
    sample_count INTEGER DEFAULT 1,
    min_value DECIMAL(20, 6),
    max_value DECIMAL(20, 6),
    avg_value DECIMAL(20, 6),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(project_id, metric_type, metric_name, hour_start)
);

CREATE INDEX idx_usage_hourly_project_hour ON public.usage_hourly(project_id, hour_start DESC);
CREATE INDEX idx_usage_hourly_organization_hour ON public.usage_hourly(organization_id, hour_start DESC);

-- 6. Daily Aggregated Usage (for billing)
CREATE TABLE IF NOT EXISTS public.usage_daily (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    metric_type TEXT NOT NULL,
    metric_name TEXT NOT NULL,
    day DATE NOT NULL,
    metric_value DECIMAL(20, 6) NOT NULL,
    unit TEXT NOT NULL,
    sample_count INTEGER DEFAULT 1,
    min_value DECIMAL(20, 6),
    max_value DECIMAL(20, 6),
    avg_value DECIMAL(20, 6),
    peak_value DECIMAL(20, 6),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(project_id, metric_type, metric_name, day)
);

CREATE INDEX idx_usage_daily_project_day ON public.usage_daily(project_id, day DESC);
CREATE INDEX idx_usage_daily_organization_day ON public.usage_daily(organization_id, day DESC);

-- 7. Monthly Billing Summaries
CREATE TABLE IF NOT EXISTS public.usage_monthly (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    month DATE NOT NULL, -- First day of the month
    metric_type TEXT NOT NULL,
    metric_name TEXT NOT NULL,
    total_value DECIMAL(20, 6) NOT NULL,
    unit TEXT NOT NULL,
    included_in_plan DECIMAL(20, 6) DEFAULT 0, -- Quota included in plan
    billable_value DECIMAL(20, 6) DEFAULT 0, -- Value exceeding quota
    overage_rate DECIMAL(10, 6) DEFAULT 0, -- Rate per unit for overage
    overage_cost DECIMAL(10, 2) DEFAULT 0, -- Calculated overage cost
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(project_id, organization_id, month, metric_type, metric_name)
);

CREATE INDEX idx_usage_monthly_organization_month ON public.usage_monthly(organization_id, month DESC);
CREATE INDEX idx_usage_monthly_project_month ON public.usage_monthly(project_id, month DESC);

-- ============================================================================
-- QUOTA MANAGEMENT AND ALERTS
-- ============================================================================

-- 8. Quota Definitions per Plan
CREATE TABLE IF NOT EXISTS public.quotas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    plan_id UUID REFERENCES public.subscription_plans(id) ON DELETE CASCADE,
    metric_type TEXT NOT NULL,
    metric_name TEXT NOT NULL,
    limit_value DECIMAL(20, 6) NOT NULL,
    unit TEXT NOT NULL,
    enforcement TEXT NOT NULL DEFAULT 'soft', -- soft (alert only), hard (block usage)
    reset_period TEXT NOT NULL, -- hourly, daily, monthly
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(plan_id, metric_type, metric_name)
);

CREATE INDEX idx_quotas_plan ON public.quotas(plan_id);

-- 9. Current Usage vs Quota Tracking
CREATE TABLE IF NOT EXISTS public.quota_usage (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    quota_id UUID REFERENCES public.quotas(id) ON DELETE CASCADE,
    current_usage DECIMAL(20, 6) NOT NULL DEFAULT 0,
    period_start TIMESTAMPTZ NOT NULL,
    period_end TIMESTAMPTZ NOT NULL,
    percentage_used DECIMAL(5, 2) DEFAULT 0,
    is_over_quota BOOLEAN DEFAULT FALSE,
    last_checked TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(project_id, quota_id, period_start)
);

CREATE INDEX idx_quota_usage_project ON public.quota_usage(project_id);
CREATE INDEX idx_quota_usage_organization ON public.quota_usage(organization_id);
CREATE INDEX idx_quota_usage_is_over_quota ON public.quota_usage(is_over_quota) WHERE is_over_quota = TRUE;

-- 10. Usage Alerts Configuration
CREATE TABLE IF NOT EXISTS public.usage_alerts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
    metric_type TEXT NOT NULL,
    metric_name TEXT NOT NULL,
    threshold_percentage DECIMAL(5, 2) NOT NULL, -- Alert at 80%, 90%, etc.
    alert_channels JSONB NOT NULL DEFAULT '[]', -- ["email", "webhook", "slack"]
    webhook_url TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    last_triggered_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_usage_alerts_organization ON public.usage_alerts(organization_id);
CREATE INDEX idx_usage_alerts_active ON public.usage_alerts(is_active) WHERE is_active = TRUE;

-- 11. Alert History
CREATE TABLE IF NOT EXISTS public.alert_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    alert_id UUID REFERENCES public.usage_alerts(id) ON DELETE CASCADE,
    project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    metric_type TEXT NOT NULL,
    metric_name TEXT NOT NULL,
    triggered_value DECIMAL(20, 6) NOT NULL,
    threshold_value DECIMAL(20, 6) NOT NULL,
    percentage_used DECIMAL(5, 2) NOT NULL,
    notification_sent BOOLEAN DEFAULT FALSE,
    notification_channels TEXT[],
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_alert_history_created ON public.alert_history(created_at DESC);
CREATE INDEX idx_alert_history_organization ON public.alert_history(organization_id);

-- ============================================================================
-- BILLING AND INVOICING
-- ============================================================================

-- 12. Monthly Invoices
CREATE TABLE IF NOT EXISTS public.invoices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    invoice_number TEXT UNIQUE NOT NULL,
    stripe_invoice_id TEXT UNIQUE,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    subtotal DECIMAL(10, 2) NOT NULL DEFAULT 0,
    tax DECIMAL(10, 2) DEFAULT 0,
    total DECIMAL(10, 2) NOT NULL DEFAULT 0,
    currency TEXT DEFAULT 'USD',
    status TEXT NOT NULL, -- draft, open, paid, void, uncollectible
    hosted_invoice_url TEXT,
    invoice_pdf TEXT,
    line_items JSONB NOT NULL DEFAULT '[]',
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    paid_at TIMESTAMPTZ
);

CREATE INDEX idx_invoices_organization ON public.invoices(organization_id);
CREATE INDEX idx_invoices_period ON public.invoices(period_start, period_end);
CREATE INDEX idx_invoices_status ON public.invoices(status);

-- 13. Invoice Line Items Breakdown
CREATE TABLE IF NOT EXISTS public.invoice_line_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    invoice_id UUID REFERENCES public.invoices(id) ON DELETE CASCADE,
    project_id UUID REFERENCES public.projects(id),
    description TEXT NOT NULL,
    metric_type TEXT,
    metric_name TEXT,
    quantity DECIMAL(20, 6) NOT NULL,
    unit TEXT NOT NULL,
    unit_price DECIMAL(10, 6) NOT NULL,
    amount DECIMAL(10, 2) NOT NULL,
    is_overage BOOLEAN DEFAULT FALSE,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_invoice_line_items_invoice ON public.invoice_line_items(invoice_id);

-- ============================================================================
-- UTILITY FUNCTIONS AND TRIGGERS
-- ============================================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at trigger to relevant tables
CREATE TRIGGER update_organizations_updated_at
    BEFORE UPDATE ON public.organizations
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_projects_updated_at
    BEFORE UPDATE ON public.projects
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_subscriptions_updated_at
    BEFORE UPDATE ON public.subscriptions
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_usage_monthly_updated_at
    BEFORE UPDATE ON public.usage_monthly
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_usage_alerts_updated_at
    BEFORE UPDATE ON public.usage_alerts
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- Function to calculate percentage used
CREATE OR REPLACE FUNCTION public.calculate_quota_percentage(
    current_usage DECIMAL,
    limit_value DECIMAL
)
RETURNS DECIMAL AS $$
BEGIN
    IF limit_value = 0 THEN
        RETURN 0;
    END IF;
    RETURN ROUND((current_usage / limit_value) * 100, 2);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to calculate overage cost
CREATE OR REPLACE FUNCTION public.calculate_overage_cost(
    total_usage DECIMAL,
    included_quota DECIMAL,
    overage_rate DECIMAL
)
RETURNS DECIMAL AS $$
DECLARE
    billable_value DECIMAL;
BEGIN
    IF total_usage <= included_quota THEN
        RETURN 0;
    END IF;
    billable_value := total_usage - included_quota;
    RETURN ROUND(billable_value * overage_rate, 2);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ============================================================================
-- VIEWS FOR COMMON QUERIES
-- ============================================================================

-- Current month usage summary per organization
CREATE OR REPLACE VIEW public.current_month_usage_summary AS
SELECT 
    o.id AS organization_id,
    o.name AS organization_name,
    o.slug AS organization_slug,
    DATE_TRUNC('month', CURRENT_DATE) AS month,
    um.metric_type,
    um.metric_name,
    SUM(um.metric_value) AS total_usage,
    um.unit,
    sp.included_quotas,
    sp.overage_rates
FROM public.organizations o
JOIN public.projects p ON p.organization_id = o.id
JOIN public.usage_metrics um ON um.organization_id = o.id
LEFT JOIN public.subscriptions s ON s.organization_id = o.id AND s.status = 'active'
LEFT JOIN public.subscription_plans sp ON sp.id = s.plan_id
WHERE um.timestamp >= DATE_TRUNC('month', CURRENT_DATE)
GROUP BY o.id, o.name, o.slug, um.metric_type, um.metric_name, um.unit, sp.included_quotas, sp.overage_rates;

-- Quota utilization dashboard
CREATE OR REPLACE VIEW public.quota_utilization_dashboard AS
SELECT 
    p.ref AS project_ref,
    p.name AS project_name,
    o.name AS organization_name,
    q.metric_type,
    q.metric_name,
    qu.current_usage,
    q.limit_value,
    qu.percentage_used,
    qu.is_over_quota,
    q.enforcement,
    qu.period_end AS resets_at
FROM public.quota_usage qu
JOIN public.quotas q ON q.id = qu.quota_id
JOIN public.projects p ON p.id = qu.project_id
JOIN public.organizations o ON o.id = qu.organization_id
WHERE qu.period_end > NOW()
ORDER BY qu.percentage_used DESC;

-- Recent alerts
CREATE OR REPLACE VIEW public.recent_alerts AS
SELECT 
    ah.id,
    p.ref AS project_ref,
    o.name AS organization_name,
    ah.metric_type,
    ah.metric_name,
    ah.triggered_value,
    ah.threshold_value,
    ah.percentage_used,
    ah.notification_sent,
    ah.created_at
FROM public.alert_history ah
JOIN public.projects p ON p.id = ah.project_id
JOIN public.organizations o ON o.id = ah.organization_id
WHERE ah.created_at >= NOW() - INTERVAL '30 days'
ORDER BY ah.created_at DESC;

-- ============================================================================
-- SEED DATA FOR PLANS AND QUOTAS
-- ============================================================================

-- Insert default subscription plans (INR Pricing - ₹)
-- Exchange rate: 1 USD = 83 INR (approximate)
INSERT INTO public.subscription_plans (name, display_name, monthly_base_price, included_quotas, overage_rates, features) VALUES
('free', 'Free', 0, 
 '{
   "database_size": 536870912,
   "auth_maus": 50000,
   "storage_size": 1073741824,
   "storage_egress": 5368709120,
   "functions_invocations": 500000,
   "realtime_connections": 200,
   "realtime_messages": 2000000
 }'::jsonb,
 '{
   "database_size": 0.000010417,
   "auth_maus": 0.27,
   "storage_size": 1.75,
   "storage_egress": 2.5,
   "functions_invocations": 0.000167,
   "realtime_connections": 0.83,
   "realtime_messages": 0.000208
 }'::jsonb,
 '["Unlimited API requests", "Community support", "500MB database", "1GB storage"]'::jsonb),

('pro', 'Pro', 2083, 
 '{
   "database_size": 8589934592,
   "auth_maus": 100000,
   "storage_size": 107374182400,
   "storage_egress": 268435456000,
   "functions_invocations": 2000000,
   "realtime_connections": 500,
   "realtime_messages": 5000000
 }'::jsonb,
 '{
   "database_size": 0.000010417,
   "auth_maus": 0.27,
   "storage_size": 1.75,
   "storage_egress": 2.5,
   "functions_invocations": 0.000167,
   "realtime_connections": 0.83,
   "realtime_messages": 0.000208
 }'::jsonb,
 '["Everything in Free", "8GB database", "100GB storage", "Email support", "Remove branding"]'::jsonb),

('team', 'Team', 49717, 
 '{
   "database_size": 8589934592,
   "auth_maus": 100000,
   "storage_size": 107374182400,
   "storage_egress": 268435456000,
   "functions_invocations": 2000000,
   "realtime_connections": 500,
   "realtime_messages": 5000000
 }'::jsonb,
 '{
   "database_size": 0.000010417,
   "auth_maus": 0.27,
   "storage_size": 1.75,
   "storage_egress": 2.5,
   "functions_invocations": 0.000167,
   "realtime_connections": 0.83,
   "realtime_messages": 0.000208
 }'::jsonb,
 '["Everything in Pro", "28 days log retention", "Platform audit logs", "SLA support"]'::jsonb),

('enterprise', 'Enterprise', 0, 
 '{}'::jsonb,
 '{}'::jsonb,
 '["Custom everything", "Dedicated support", "SLA guarantees", "SOC2/HIPAA compliance"]'::jsonb)
ON CONFLICT (name) DO NOTHING;

-- Grant permissions
GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO postgres, anon, authenticated, service_role;

COMMENT ON TABLE public.usage_metrics IS 'Raw time-series usage metrics collected from all services';
COMMENT ON TABLE public.usage_hourly IS 'Hourly aggregated usage metrics';
COMMENT ON TABLE public.usage_daily IS 'Daily aggregated usage for billing calculations';
COMMENT ON TABLE public.usage_monthly IS 'Monthly billing summaries with overage calculations';
COMMENT ON TABLE public.quotas IS 'Quota definitions per subscription plan';
COMMENT ON TABLE public.quota_usage IS 'Current usage vs quota tracking per period';
COMMENT ON TABLE public.usage_alerts IS 'User-configured usage alerts and thresholds';
COMMENT ON TABLE public.invoices IS 'Monthly invoices with line items';
