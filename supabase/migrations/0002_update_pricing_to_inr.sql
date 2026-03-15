-- Update Subscription Plans to INR Pricing (₹)
-- Exchange Rate: 1 USD = 83 INR (approximate)
-- Run this migration AFTER the initial usage_tracking_schema migration

-- ============================================================================
-- UPDATE PRICING TO INR
-- ============================================================================

-- Update Pro Plan: $25 → ₹2,083
UPDATE public.subscription_plans 
SET 
  monthly_base_price = 2083,
  overage_rates = '{
    "database_size": 0.000010417,
    "auth_maus": 0.27,
    "storage_size": 1.75,
    "storage_egress": 2.5,
    "functions_invocations": 0.000167,
    "realtime_connections": 0.83,
    "realtime_messages": 0.000208
  }'::jsonb
WHERE name = 'pro';

-- Update Team Plan: $599 → ₹49,717
UPDATE public.subscription_plans 
SET 
  monthly_base_price = 49717,
  overage_rates = '{
    "database_size": 0.000010417,
    "auth_maus": 0.27,
    "storage_size": 1.75,
    "storage_egress": 2.5,
    "functions_invocations": 0.000167,
    "realtime_connections": 0.83,
    "realtime_messages": 0.000208
  }'::jsonb
WHERE name = 'team';

-- ============================================================================
-- ADD CURRENCY CONFIGURATION
-- ============================================================================

-- Add currency column if not exists (optional, for future multi-currency support)
ALTER TABLE public.subscription_plans 
ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'INR';

-- Update all plans to INR
UPDATE public.subscription_plans SET currency = 'INR';

-- ============================================================================
-- VERIFICATION QUERY
-- ============================================================================

-- View updated pricing
SELECT 
  name,
  display_name,
  monthly_base_price,
  currency,
  overage_rates
FROM public.subscription_plans
ORDER BY monthly_base_price;

-- ============================================================================
-- PRICING SUMMARY (INR)
-- ============================================================================

/*
Plan          | USD Price | INR Price | Included Quotas
--------------|-----------|-----------|------------------
Free          | $0        | ₹0        | 500MB DB, 50K MAU, 1GB Storage
Pro           | $25       | ₹2,083    | 8GB DB, 100K MAU, 100GB Storage
Team          | $599      | ₹49,717   | 8GB DB, 100K MAU, 100GB Storage + SLA
Enterprise    | Custom    | Custom    | Everything custom

Overage Rates (per unit):
- Database Size: ₹0.000010417/byte (₹125/GB)
- MAU: ₹0.27/user
- Storage: ₹1.75/GB
- Egress: ₹2.5/GB
- Functions: ₹0.000167/invocation (₹167 per million)
- Realtime Connections: ₹0.83/connection
- Realtime Messages: ₹0.000208/message (₹208 per million)
*/

COMMENT ON TABLE public.subscription_plans IS 'Subscription plans with INR pricing (₹)';
