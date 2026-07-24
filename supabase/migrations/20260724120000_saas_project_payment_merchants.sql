-- Indobase Payments — project-scoped merchant KYC / Route-shaped linked-account profile.
--
-- Settlements are intended to go to the merchant's own bank account via a licensed aggregator
-- (e.g. Razorpay Route / Linked Accounts). Indobase orchestrates onboarding and billing; it does
-- not take custody of funds. This table stores KYC state in Studio so operators can onboard
-- before money-movement APIs are wired.
--
-- Not related to Indobase plan billing (saas.organizations + razorpay-billing.ts).

create table if not exists saas.project_payment_merchants (
  id uuid primary key default gen_random_uuid(),
  project_ref text not null references saas.projects(ref) on delete cascade,
  organization_id integer not null references saas.organizations(id) on delete cascade,

  -- draft → submitted → under_review → verified | rejected
  kyc_status text not null default 'draft'
    check (kyc_status in ('draft', 'submitted', 'under_review', 'verified', 'rejected')),
  kyc_rejection_reason text null,
  submitted_at timestamptz null,
  reviewed_at timestamptz null,
  verified_at timestamptz null,

  -- Business details
  business_legal_name text null,
  business_trade_name text null,
  business_type text null
    check (
      business_type is null
      or business_type in (
        'individual',
        'proprietorship',
        'partnership',
        'private_limited',
        'public_limited',
        'llp',
        'trust',
        'other'
      )
    ),
  pan text null,
  gstin text null,
  business_address_line1 text null,
  business_address_line2 text null,
  business_city text null,
  business_state text null,
  business_postal_code text null,
  business_country text not null default 'IN',
  contact_email text null,
  contact_phone text null,

  -- Bank account: full account number encrypted; last4 for display only
  bank_account_holder_name text null,
  bank_account_number_enc text null,
  bank_account_last4 text null,
  bank_ifsc text null,
  bank_name text null,

  -- Document upload metadata only (no file bytes in control-plane DB)
  -- [{ id, kind, file_name, content_type, size_bytes, uploaded_at }]
  documents jsonb not null default '[]'::jsonb,

  -- Aggregator / Route linked-account placeholder (filled when Razorpay keys present)
  aggregator_provider text not null default 'razorpay_route',
  aggregator_account_id text null,
  aggregator_status text null,
  aggregator_meta jsonb not null default '{}'::jsonb,

  created_by_gotrue_id uuid null,
  updated_by_gotrue_id uuid null,
  inserted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (project_ref)
);

create index if not exists saas_project_payment_merchants_org_idx
  on saas.project_payment_merchants (organization_id);

create index if not exists saas_project_payment_merchants_kyc_status_idx
  on saas.project_payment_merchants (kyc_status);

comment on table saas.project_payment_merchants is
  'Indobase Payments merchant KYC / Route-shaped linked-account profile per project. Settlements to merchant account; Indobase does not take custody.';

select saas.grant_studio_access();
