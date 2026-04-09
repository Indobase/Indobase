-- Migration: Add missing columns and tables required by GoTrue v2.186.0
-- This must be run once on existing databases. On fresh deploys, GoTrue runs
-- its own migrations automatically.
--
-- Usage (on VPS):
--   docker exec -it indobase-db psql -U supabase_admin -d postgres -f /docker-entrypoint-initdb.d/migrations/20260409_gotrue_v2_schema.sql
-- Or copy-paste the contents into psql.

-- ============================================================
-- auth.users: add missing columns
-- ============================================================
ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS banned_until timestamptz;
ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS is_sso_user boolean NOT NULL DEFAULT false;
ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS is_anonymous boolean NOT NULL DEFAULT false;

-- ============================================================
-- auth.refresh_tokens: add missing columns
-- ============================================================
ALTER TABLE auth.refresh_tokens ADD COLUMN IF NOT EXISTS session_id uuid;
ALTER TABLE auth.refresh_tokens ADD COLUMN IF NOT EXISTS parent varchar(255);

-- ============================================================
-- auth.sessions
-- ============================================================
CREATE TABLE IF NOT EXISTS auth.sessions (
  id uuid NOT NULL PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz,
  updated_at timestamptz,
  factor_id uuid,
  aal varchar(255),
  not_after timestamptz,
  refreshed_at timestamp,
  user_agent text,
  ip inet,
  tag text
);
CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON auth.sessions(user_id);
CREATE INDEX IF NOT EXISTS sessions_not_after_idx ON auth.sessions(not_after);

-- ============================================================
-- auth.mfa_factors
-- ============================================================
CREATE TABLE IF NOT EXISTS auth.mfa_factors (
  id uuid NOT NULL PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  friendly_name text,
  factor_type varchar(255) NOT NULL,
  status varchar(255) NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  secret text,
  phone text,
  last_challenged_at timestamptz,
  web_authn_credential jsonb,
  web_authn_aaguid uuid
);
CREATE INDEX IF NOT EXISTS mfa_factors_user_id_idx ON auth.mfa_factors(user_id);

-- ============================================================
-- auth.mfa_challenges
-- ============================================================
CREATE TABLE IF NOT EXISTS auth.mfa_challenges (
  id uuid NOT NULL PRIMARY KEY,
  factor_id uuid NOT NULL REFERENCES auth.mfa_factors(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL,
  verified_at timestamptz,
  ip_address inet NOT NULL,
  otp_code text,
  web_authn_session_data jsonb
);

-- ============================================================
-- auth.identities
-- ============================================================
CREATE TABLE IF NOT EXISTS auth.identities (
  provider_id text NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  identity_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  provider text NOT NULL,
  last_sign_in_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  email text GENERATED ALWAYS AS (lower(identity_data->>'email')) STORED,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  CONSTRAINT identities_pkey PRIMARY KEY (id)
);
CREATE INDEX IF NOT EXISTS identities_user_id_idx ON auth.identities(user_id);

-- ============================================================
-- auth.sso_providers
-- ============================================================
CREATE TABLE IF NOT EXISTS auth.sso_providers (
  id uuid NOT NULL PRIMARY KEY,
  resource_id text,
  created_at timestamptz,
  updated_at timestamptz
);

-- ============================================================
-- auth.sso_domains
-- ============================================================
CREATE TABLE IF NOT EXISTS auth.sso_domains (
  id uuid NOT NULL PRIMARY KEY,
  sso_provider_id uuid NOT NULL REFERENCES auth.sso_providers(id) ON DELETE CASCADE,
  domain text NOT NULL,
  created_at timestamptz,
  updated_at timestamptz
);

-- ============================================================
-- auth.saml_providers
-- ============================================================
CREATE TABLE IF NOT EXISTS auth.saml_providers (
  id uuid NOT NULL PRIMARY KEY,
  sso_provider_id uuid NOT NULL REFERENCES auth.sso_providers(id) ON DELETE CASCADE,
  entity_id text NOT NULL,
  metadata_xml text NOT NULL,
  metadata_url text,
  attribute_mapping jsonb,
  created_at timestamptz,
  updated_at timestamptz,
  name_id_format text
);

-- ============================================================
-- auth.saml_relay_states
-- ============================================================
CREATE TABLE IF NOT EXISTS auth.saml_relay_states (
  id uuid NOT NULL PRIMARY KEY,
  sso_provider_id uuid NOT NULL REFERENCES auth.sso_providers(id) ON DELETE CASCADE,
  request_id text NOT NULL,
  for_email text,
  redirect_to text,
  created_at timestamptz,
  updated_at timestamptz,
  flow_state_id uuid
);

-- ============================================================
-- auth.flow_state
-- ============================================================
CREATE TABLE IF NOT EXISTS auth.flow_state (
  id uuid NOT NULL PRIMARY KEY,
  user_id uuid,
  auth_code text NOT NULL,
  code_challenge_method varchar(255) NOT NULL,
  code_challenge text NOT NULL,
  provider_type text NOT NULL,
  provider_access_token text,
  provider_refresh_token text,
  created_at timestamptz,
  updated_at timestamptz,
  authentication_method text NOT NULL,
  auth_code_issued_at timestamptz
);

-- ============================================================
-- auth.one_time_tokens
-- ============================================================
CREATE TABLE IF NOT EXISTS auth.one_time_tokens (
  id uuid NOT NULL PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token_type varchar(255) NOT NULL,
  token_hash text NOT NULL,
  relates_to text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS one_time_tokens_user_id_idx ON auth.one_time_tokens(user_id);
CREATE INDEX IF NOT EXISTS one_time_tokens_relates_to_idx ON auth.one_time_tokens(relates_to);
