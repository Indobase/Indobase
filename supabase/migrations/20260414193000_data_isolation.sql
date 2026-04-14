-- Data Isolation & Privacy Fix (Refined for Auth-Safety)
-- This migration ensures that users can only see their own data (organizations, projects, products, etc.)
-- while maintaining the integrity of the login, signup, and logout processes.

-- 1. Helper Function: Get current user ID (alias for auth.uid())
CREATE OR REPLACE FUNCTION public.current_user_id()
RETURNS UUID AS $$
  SELECT auth.uid();
$$ LANGUAGE sql STABLE;

-- 2. Owner Assignment Function (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.set_owner_id() 
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.user_id IS NULL THEN
        NEW.user_id := auth.uid();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Update Schemas for Organizations and Projects
-- These are the root of the ownership chain.

DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='organizations' AND column_name='user_id') THEN
        ALTER TABLE public.organizations ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='projects' AND column_name='user_id') THEN
        ALTER TABLE public.projects ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
    END IF;
END $$;

-- 4. Enable Row Level Security (RLS) on ALL sensitive tables
DO $$
DECLARE
    t text;
BEGIN
    FOR t IN 
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name IN (
            'organizations', 'projects', 'products', 'orders', 'cart', 'order_items', 'users',
            'usage_metrics', 'usage_hourly', 'usage_daily', 'usage_monthly', 
            'quotas', 'quota_usage', 'usage_alerts', 'alert_history', 
            'invoices', 'invoice_line_items'
        )
    LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    END LOOP;
END $$;

-- 5. Automatic Ownership Triggers for primary entities
DROP TRIGGER IF EXISTS tr_organizations_owner ON public.organizations;
CREATE TRIGGER tr_organizations_owner BEFORE INSERT ON public.organizations FOR EACH ROW EXECUTE FUNCTION public.set_owner_id();

DROP TRIGGER IF EXISTS tr_projects_owner ON public.projects;
CREATE TRIGGER tr_projects_owner BEFORE INSERT ON public.projects FOR EACH ROW EXECUTE FUNCTION public.set_owner_id();

DROP TRIGGER IF EXISTS tr_products_owner ON public.products;
CREATE TRIGGER tr_products_owner BEFORE INSERT ON public.products FOR EACH ROW EXECUTE FUNCTION public.set_owner_id();

-- 6. RLS POLICIES

-- ORGANIZATIONS
DROP POLICY IF EXISTS "Users can only see their own organizations" ON public.organizations;
CREATE POLICY "Users can only see their own organizations" ON public.organizations FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can only insert their own organizations" ON public.organizations;
CREATE POLICY "Users can only insert their own organizations" ON public.organizations FOR INSERT WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

DROP POLICY IF EXISTS "Users can only update their own organizations" ON public.organizations;
CREATE POLICY "Users can only update their own organizations" ON public.organizations FOR UPDATE USING (auth.uid() = user_id);

-- PROJECTS
DROP POLICY IF EXISTS "Users can only see their own projects" ON public.projects;
CREATE POLICY "Users can only see their own projects" ON public.projects FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can only insert their own projects" ON public.projects;
CREATE POLICY "Users can only insert their own projects" ON public.projects FOR INSERT WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

-- USERS (Profiles) - Safety first
DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON public.users;
CREATE POLICY "Profiles are viewable by everyone" ON public.users FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can insert their own profile" ON public.users;
CREATE POLICY "Users can insert their own profile" ON public.users FOR INSERT WITH CHECK (auth.uid() = id);

-- USAGE & BILLING: Secure by joining with organizations/projects
-- This ensures that sub-resources are only visible if the parent is owned by the user.

-- Usage Metrics
DROP POLICY IF EXISTS "Users can only see own usage" ON public.usage_metrics;
CREATE POLICY "Users can only see own usage" ON public.usage_metrics FOR SELECT 
USING (EXISTS (SELECT 1 FROM public.organizations o WHERE o.id = organization_id AND o.user_id = auth.uid()));

-- Invoices
DROP POLICY IF EXISTS "Users can only see own invoices" ON public.invoices;
CREATE POLICY "Users can only see own invoices" ON public.invoices FOR SELECT 
USING (EXISTS (SELECT 1 FROM public.organizations o WHERE o.id = organization_id AND o.user_id = auth.uid()));

-- Usage Alerts
DROP POLICY IF EXISTS "Users can manage own alerts" ON public.usage_alerts;
CREATE POLICY "Users can manage own alerts" ON public.usage_alerts FOR ALL 
USING (EXISTS (SELECT 1 FROM public.organizations o WHERE o.id = organization_id AND o.user_id = auth.uid()));

-- 7. CLEAN UP PERMISSIONS
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;
