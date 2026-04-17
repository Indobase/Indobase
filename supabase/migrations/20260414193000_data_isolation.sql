-- Data Isolation & Privacy Fix (Comprehensive Multi-Tenant Implementation)
-- This migration ensures that users can only see their own data across all tables.

-- 1. Helper Function: Get current user ID
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

-- 3. Update Schemas for ALL sensitive tables
-- Ensure EVERY user-owned table has a user_id column
DO $$ 
DECLARE
    t text;
BEGIN 
    FOR t IN 
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name IN (
            'organizations', 'projects', 'products', 'orders', 'cart', 'order_items',
            'usage_metrics', 'usage_hourly', 'usage_daily', 'usage_monthly', 
            'quotas', 'quota_usage', 'usage_alerts', 'alert_history', 
            'invoices', 'invoice_line_items'
        )
    LOOP
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=t AND column_name='user_id') THEN
            EXECUTE format('ALTER TABLE public.%I ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE', t);
        END IF;
    END LOOP;
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

-- 5. Automatic Ownership Triggers
-- This ensures that when a record is created, the user_id is automatically set to the creator's ID.
DO $$
DECLARE
    t text;
BEGIN
    FOR t IN 
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name IN (
            'organizations', 'projects', 'products', 'orders', 'cart', 'order_items',
            'usage_metrics', 'usage_alerts', 'invoices'
        )
    LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS tr_%I_owner ON public.%I', t, t);
        EXECUTE format('CREATE TRIGGER tr_%I_owner BEFORE INSERT ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_owner_id()', t, t);
    END LOOP;
END $$;

-- 6. RLS POLICIES

-- Standard User-Owned Policy Template
-- This covers most tables where user_id is the primary ownership signal.
DO $$
DECLARE
    t text;
BEGIN
    FOR t IN 
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name IN (
            'organizations', 'projects', 'products', 'orders', 'cart', 'order_items',
            'usage_metrics', 'usage_hourly', 'usage_daily', 'usage_monthly', 
            'quotas', 'quota_usage', 'usage_alerts', 'alert_history', 
            'invoices', 'invoice_line_items'
        )
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS "Users can only see own %s" ON public.%I', t, t);
        EXECUTE format('CREATE POLICY "Users can only see own %s" ON public.%I FOR SELECT USING (auth.uid() = user_id)', t, t);
        
        EXECUTE format('DROP POLICY IF EXISTS "Users can only insert own %s" ON public.%I', t, t);
        EXECUTE format('CREATE POLICY "Users can only insert own %s" ON public.%I FOR INSERT WITH CHECK (auth.uid() = user_id OR user_id IS NULL)', t, t);
        
        EXECUTE format('DROP POLICY IF EXISTS "Users can only update own %s" ON public.%I', t, t);
        EXECUTE format('CREATE POLICY "Users can only update own %s" ON public.%I FOR UPDATE USING (auth.uid() = user_id)', t, t);
        
        EXECUTE format('DROP POLICY IF EXISTS "Users can only delete own %s" ON public.%I', t, t);
        EXECUTE format('CREATE POLICY "Users can only delete own %s" ON public.%I FOR DELETE USING (auth.uid() = user_id)', t, t);
    END LOOP;
END $$;

-- USERS (Profiles) - Safety first
-- Users should be able to see their own profile and create it on signup.
DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON public.users;
CREATE POLICY "Profiles are viewable by owner" ON public.users FOR SELECT USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can insert their own profile" ON public.users;
CREATE POLICY "Users can insert their own profile" ON public.users FOR INSERT WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update their own profile" ON public.users;
CREATE POLICY "Users can update their own profile" ON public.users FOR UPDATE USING (auth.uid() = id);

-- 7. CLEAN UP PERMISSIONS
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;
