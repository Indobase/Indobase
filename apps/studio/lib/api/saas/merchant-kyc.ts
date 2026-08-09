import type { JwtPayload } from '@indobaseinc/indobase-js'
import { randomUUID } from 'node:crypto'

import { publishDiscussEvent } from './discuss-events'
import {
  adapterForSettlementMarket,
  getMerchantOnboardingProvider,
  resolveSettlementAdapter,
  settlementMarketForAdapter,
} from './merchant-kyc-provider'
import type {
  MerchantBusinessType,
  MerchantDocumentMeta,
  MerchantKycStatus,
  MerchantProfilePatch,
  MerchantProfilePublic,
} from './merchant-kyc-types'
import { ensureSaasTables, getGotrueUserId, getPrimaryEmail } from './platform'
import {
  isPaymentsMerchantAdminRole,
  paymentsTenantSlugForOrg,
  resolvePaymentsRole,
  type PaymentsRole,
} from './payments-access'
import { executeQuery } from './query'
import {
  GATEWAY_EXTERNAL_LINKS,
  hintId,
  validateRazorpayKeys,
  validateStripeKeys,
  type GatewayConnectBody,
} from './merchant-gateway-keys'
import { syncMerchantGatewayKeysToPayments } from './merchant-gateway-sync'
import { decryptString, encryptString } from './util'

export type { GatewayConnectBody } from './merchant-gateway-keys'

export type {
  MerchantBusinessType,
  MerchantDocumentMeta,
  MerchantKycStatus,
  MerchantProfilePatch,
  MerchantProfilePublic,
} from './merchant-kyc-types'

type Claims = JwtPayload & Record<string, unknown>

type MerchantRow = {
  id: string
  project_ref: string
  organization_id: number
  kyc_status: MerchantKycStatus
  kyc_rejection_reason: string | null
  submitted_at: string | null
  reviewed_at: string | null
  verified_at: string | null
  business_legal_name: string | null
  business_trade_name: string | null
  business_type: MerchantBusinessType | null
  pan: string | null
  gstin: string | null
  business_address_line1: string | null
  business_address_line2: string | null
  business_city: string | null
  business_state: string | null
  business_postal_code: string | null
  business_country: string
  contact_email: string | null
  contact_phone: string | null
  bank_account_holder_name: string | null
  bank_account_number_enc: string | null
  bank_account_last4: string | null
  bank_ifsc: string | null
  bank_name: string | null
  documents: MerchantDocumentMeta[] | string
  aggregator_provider: string
  aggregator_account_id: string | null
  aggregator_status: string | null
  aggregator_meta: Record<string, unknown> | string
  inserted_at: string
  updated_at: string
}

const BUSINESS_TYPES = new Set<MerchantBusinessType>([
  'individual',
  'proprietorship',
  'partnership',
  'private_limited',
  'public_limited',
  'llp',
  'trust',
  'other',
])

const EDITABLE_STATUSES = new Set<MerchantKycStatus>(['draft', 'rejected'])

const MERCHANT_SCHEMA_SQL = `
create table if not exists saas.project_payment_merchants (
  id uuid primary key default gen_random_uuid(),
  project_ref text not null references saas.projects(ref) on delete cascade,
  organization_id integer not null references saas.organizations(id) on delete cascade,
  kyc_status text not null default 'draft'
    check (kyc_status in ('draft', 'submitted', 'under_review', 'verified', 'rejected')),
  kyc_rejection_reason text null,
  submitted_at timestamptz null,
  reviewed_at timestamptz null,
  verified_at timestamptz null,
  business_legal_name text null,
  business_trade_name text null,
  business_type text null,
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
  bank_account_holder_name text null,
  bank_account_number_enc text null,
  bank_account_last4 text null,
  bank_ifsc text null,
  bank_name text null,
  documents jsonb not null default '[]'::jsonb,
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
`

let schemaEnsured = false

async function ensureMerchantProfileSchema() {
  await ensureSaasTables()
  if (schemaEnsured) return
  const created = await executeQuery({ query: MERCHANT_SCHEMA_SQL })
  if (created.error) throw created.error
  // Best-effort grants for new objects on already-bootstrapped control planes.
  await executeQuery({ query: `select saas.grant_studio_access()` }).catch(() => undefined)
  schemaEnsured = true
}

function maskPan(pan: string | null | undefined): string | null {
  const cleaned = (pan || '').trim().toUpperCase()
  if (!cleaned) return null
  if (cleaned.length < 6) return '****'
  return `${cleaned.slice(0, 5)}****${cleaned.slice(-1)}`
}

function maskBankAccount(last4: string | null | undefined): string | null {
  const digits = (last4 || '').replace(/\D/g, '')
  if (!digits) return null
  return `XXXXXX${digits.slice(-4)}`
}

function parseDocuments(raw: MerchantDocumentMeta[] | string | null | undefined): MerchantDocumentMeta[] {
  if (!raw) return []
  if (Array.isArray(raw)) return raw
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function normalizePan(value: string | null | undefined): string | null {
  if (value == null) return null
  const cleaned = value.trim().toUpperCase().replace(/\s+/g, '')
  if (!cleaned) return null
  if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(cleaned)) {
    throw new Error('PAN must be in format ABCDE1234F')
  }
  return cleaned
}

function normalizeIfsc(value: string | null | undefined): string | null {
  if (value == null) return null
  const cleaned = value.trim().toUpperCase().replace(/\s+/g, '')
  if (!cleaned) return null
  if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(cleaned)) {
    throw new Error('IFSC must be in format ABCD0123456')
  }
  return cleaned
}

function normalizeAccountNumber(value: string | null | undefined): {
  enc: string | null
  last4: string | null
} {
  if (value == null) return { enc: null, last4: null }
  const digits = value.replace(/\s+/g, '').trim()
  if (!digits) return { enc: null, last4: null }
  if (!/^\d{9,18}$/.test(digits)) {
    throw new Error('Bank account number must be 9–18 digits')
  }
  return { enc: encryptString(digits), last4: digits.slice(-4) }
}

function normalizeDocuments(docs: MerchantDocumentMeta[] | null | undefined): MerchantDocumentMeta[] {
  if (!docs) return []
  if (!Array.isArray(docs)) throw new Error('documents must be an array')
  return docs.map((doc) => {
    const kind = typeof doc.kind === 'string' ? doc.kind.trim() : ''
    const fileName = typeof doc.file_name === 'string' ? doc.file_name.trim() : ''
    if (!kind || !fileName) throw new Error('Each document needs kind and file_name')
    return {
      id: typeof doc.id === 'string' && doc.id ? doc.id : randomUUID(),
      kind,
      file_name: fileName,
      content_type: doc.content_type ?? null,
      size_bytes: typeof doc.size_bytes === 'number' ? doc.size_bytes : null,
      uploaded_at: doc.uploaded_at || new Date().toISOString(),
    }
  })
}

function parseAggregatorMeta(raw: MerchantRow['aggregator_meta']): Record<string, unknown> {
  if (!raw) return {}
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as Record<string, unknown>
    } catch {
      return {}
    }
  }
  return typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
}

function toPublic(row: MerchantRow): MerchantProfilePublic {
  const status = row.kyc_status
  const settlementAdapter = resolveSettlementAdapter({
    country: row.business_country,
    storedProvider: row.aggregator_provider,
  })
  const canConfirmGoLive = status === 'submitted' || status === 'under_review'
  const meta = parseAggregatorMeta(row.aggregator_meta)
  const onboardingUrl =
    typeof meta.onboarding_url === 'string' && meta.onboarding_url.startsWith('https://')
      ? meta.onboarding_url
      : null
  const aggregatorMessage =
    typeof meta.message === 'string'
      ? meta.message
      : typeof row.kyc_rejection_reason === 'string' && status === 'under_review'
        ? row.kyc_rejection_reason
        : null
  const gatewayKeysConfigured = meta.gateway_keys_configured === true
  const gatewayConnectorSynced = meta.gateway_connector_synced === true
  const gatewayKeyHint =
    typeof meta.gateway_key_id_hint === 'string' ? meta.gateway_key_id_hint : null

  return {
    id: row.id,
    project_ref: row.project_ref,
    organization_id: row.organization_id,
    kyc_status: status,
    kyc_rejection_reason: row.kyc_rejection_reason,
    submitted_at: row.submitted_at,
    reviewed_at: row.reviewed_at,
    verified_at: row.verified_at,
    business_legal_name: row.business_legal_name,
    business_trade_name: row.business_trade_name,
    business_type: row.business_type,
    pan_masked: maskPan(row.pan),
    gstin: row.gstin,
    business_address_line1: row.business_address_line1,
    business_address_line2: row.business_address_line2,
    business_city: row.business_city,
    business_state: row.business_state,
    business_postal_code: row.business_postal_code,
    business_country: row.business_country || 'IN',
    contact_email: row.contact_email,
    contact_phone: row.contact_phone,
    bank_account_holder_name: row.bank_account_holder_name,
    bank_account_masked: maskBankAccount(row.bank_account_last4),
    bank_account_last4: row.bank_account_last4,
    bank_ifsc: row.bank_ifsc,
    bank_name: row.bank_name,
    documents: parseDocuments(row.documents),
    aggregator_provider: settlementAdapter,
    aggregator_account_id: row.aggregator_account_id,
    aggregator_status: row.aggregator_status,
    settlement_adapter: settlementAdapter,
    settlement_market: settlementMarketForAdapter(settlementAdapter),
    onboarding_url: onboardingUrl,
    aggregator_message: aggregatorMessage,
    route_product_id: typeof meta.product_id === 'string' ? meta.product_id : null,
    route_activation_status:
      typeof meta.activation_status === 'string' ? meta.activation_status : null,
    gateway_keys_configured: gatewayKeysConfigured,
    gateway_connector_synced: gatewayConnectorSynced,
    gateway_key_hint: gatewayKeyHint,
    can_confirm_go_live: canConfirmGoLive && !gatewayKeysConfigured,
    can_browse_payments: true,
    // BYOK: keys validated + saved is enough to go live (KYC done on Razorpay/Stripe).
    can_go_live: status === 'verified' || gatewayKeysConfigured,
    can_edit_merchant_kyc: false,
    organization_slug: '',
    payments_tenant_slug: '',
    payments_role: null,
    inserted_at: row.inserted_at,
    updated_at: row.updated_at,
  }
}

function withAccessMeta(
  profile: MerchantProfilePublic,
  opts: {
    organizationSlug: string
    role: PaymentsRole
  }
): MerchantProfilePublic {
  const canEdit = isPaymentsMerchantAdminRole(opts.role)
  return {
    ...profile,
    can_edit_merchant_kyc: canEdit,
    can_confirm_go_live: canEdit && profile.can_confirm_go_live,
    organization_slug: opts.organizationSlug,
    payments_tenant_slug: paymentsTenantSlugForOrg(opts.organizationSlug),
    payments_role: opts.role,
  }
}

async function assertPaymentsAccess(claims: Claims, ref: string) {
  await ensureMerchantProfileSchema()
  const actorId = getGotrueUserId(claims)
  const project = await executeQuery<{
    ref: string
    organization_id: number
    organization_slug: string
  }>({
    query: `
      select p.ref, p.organization_id, p.organization_slug
      from saas.projects p
      join saas.organization_members m on m.organization_id = p.organization_id
      where p.ref = $1 and m.gotrue_id = $2
      limit 1
    `,
    parameters: [ref, actorId],
    actorId,
  })
  if (project.error) throw project.error
  if (!project.data?.length) throw new Error('Project not found')

  const role = await resolvePaymentsRole(actorId, project.data[0].organization_slug)
  if (!role) {
    throw new Error(
      'Ask an organization owner or admin to grant you Payments access (owner, admin, developer, or viewer).'
    )
  }

  return { actorId, project: project.data[0], role }
}

async function assertMerchantAdminAccess(claims: Claims, ref: string) {
  const access = await assertPaymentsAccess(claims, ref)
  if (!isPaymentsMerchantAdminRole(access.role)) {
    throw new Error('Merchant onboarding is available to organization owners and admins only')
  }
  return access
}

async function loadRow(projectRef: string, actorId: string): Promise<MerchantRow | null> {
  const result = await executeQuery<MerchantRow>({
    query: `
      select
        id, project_ref, organization_id, kyc_status, kyc_rejection_reason,
        submitted_at, reviewed_at, verified_at,
        business_legal_name, business_trade_name, business_type, pan, gstin,
        business_address_line1, business_address_line2, business_city, business_state,
        business_postal_code, business_country, contact_email, contact_phone,
        bank_account_holder_name, bank_account_number_enc, bank_account_last4,
        bank_ifsc, bank_name, documents,
        aggregator_provider, aggregator_account_id, aggregator_status, aggregator_meta,
        inserted_at, updated_at
      from saas.project_payment_merchants
      where project_ref = $1
      limit 1
    `,
    parameters: [projectRef],
    actorId,
  })
  if (result.error) throw result.error
  return result.data?.[0] ?? null
}

async function ensureDraftRow({
  actorId,
  projectRef,
  organizationId,
  contactEmail,
}: {
  actorId: string
  projectRef: string
  organizationId: number
  contactEmail: string
}): Promise<MerchantRow> {
  const existing = await loadRow(projectRef, actorId)
  if (existing) return existing

  const inserted = await executeQuery<MerchantRow>({
    query: `
      insert into saas.project_payment_merchants (
        project_ref, organization_id, contact_email, created_by_gotrue_id, updated_by_gotrue_id
      )
      values ($1, $2, $3, $4, $4)
      on conflict (project_ref) do update
        set updated_at = saas.project_payment_merchants.updated_at
      returning
        id, project_ref, organization_id, kyc_status, kyc_rejection_reason,
        submitted_at, reviewed_at, verified_at,
        business_legal_name, business_trade_name, business_type, pan, gstin,
        business_address_line1, business_address_line2, business_city, business_state,
        business_postal_code, business_country, contact_email, contact_phone,
        bank_account_holder_name, bank_account_number_enc, bank_account_last4,
        bank_ifsc, bank_name, documents,
        aggregator_provider, aggregator_account_id, aggregator_status, aggregator_meta,
        inserted_at, updated_at
    `,
    parameters: [projectRef, organizationId, contactEmail || null, actorId],
    actorId,
  })
  if (inserted.error) throw inserted.error
  const row = inserted.data?.[0]
  if (!row) throw new Error('Failed to create merchant profile')
  return row
}

export async function getMerchantProfile({
  claims,
  ref,
}: {
  claims: Claims
  ref: string
}): Promise<MerchantProfilePublic> {
  const { actorId, project, role } = await assertPaymentsAccess(claims, ref)
  const row = await ensureDraftRow({
    actorId,
    projectRef: project.ref,
    organizationId: project.organization_id,
    contactEmail: getPrimaryEmail(claims),
  })
  return withAccessMeta(toPublic(row), {
    organizationSlug: project.organization_slug,
    role,
  })
}

export async function patchMerchantProfile({
  claims,
  ref,
  patch,
}: {
  claims: Claims
  ref: string
  patch: MerchantProfilePatch
}): Promise<MerchantProfilePublic> {
  const { actorId, project, role } = await assertMerchantAdminAccess(claims, ref)
  const current = await ensureDraftRow({
    actorId,
    projectRef: project.ref,
    organizationId: project.organization_id,
    contactEmail: getPrimaryEmail(claims),
  })

  if (!EDITABLE_STATUSES.has(current.kyc_status)) {
    throw new Error(
      `Merchant profile cannot be edited while KYC status is "${current.kyc_status}". Contact support if you need changes.`
    )
  }

  if (patch.business_type != null && patch.business_type !== '' && !BUSINESS_TYPES.has(patch.business_type)) {
    throw new Error('Invalid business_type')
  }

  const pan =
    patch.pan !== undefined ? normalizePan(patch.pan) : undefined
  const ifsc =
    patch.bank_ifsc !== undefined ? normalizeIfsc(patch.bank_ifsc) : undefined
  const account =
    patch.bank_account_number !== undefined
      ? normalizeAccountNumber(patch.bank_account_number)
      : undefined
  const documents =
    patch.documents !== undefined ? normalizeDocuments(patch.documents) : undefined

  if (
    patch.settlement_market != null &&
    patch.settlement_market !== 'india' &&
    patch.settlement_market !== 'international'
  ) {
    throw new Error('Invalid settlement_market')
  }

  const nextCountry =
    patch.business_country !== undefined
      ? patch.business_country?.trim().toUpperCase() || 'IN'
      : patch.settlement_market === 'india'
        ? 'IN'
        : patch.settlement_market === 'international' &&
            (!current.business_country ||
              current.business_country.toUpperCase() === 'IN' ||
              current.business_country.toUpperCase() === 'IND')
          ? 'US'
          : null

  let nextAggregator: string | null = null
  if (patch.settlement_market) {
    nextAggregator = adapterForSettlementMarket(patch.settlement_market)
  } else if (patch.business_country !== undefined) {
    // Country change re-picks the rail (ignore prior stored provider for this update).
    nextAggregator = resolveSettlementAdapter({
      country: nextCountry || current.business_country,
      storedProvider: null,
    })
  }

  // Rejected → draft when the operator starts editing again.
  const nextStatus: MerchantKycStatus =
    current.kyc_status === 'rejected' ? 'draft' : current.kyc_status

  const updated = await executeQuery<MerchantRow>({
    query: `
      update saas.project_payment_merchants
      set
        kyc_status = $2,
        kyc_rejection_reason = case when $2 = 'draft' then null else kyc_rejection_reason end,
        business_legal_name = coalesce($3, business_legal_name),
        business_trade_name = coalesce($4, business_trade_name),
        business_type = coalesce($5, business_type),
        pan = coalesce($6, pan),
        gstin = coalesce($7, gstin),
        business_address_line1 = coalesce($8, business_address_line1),
        business_address_line2 = coalesce($9, business_address_line2),
        business_city = coalesce($10, business_city),
        business_state = coalesce($11, business_state),
        business_postal_code = coalesce($12, business_postal_code),
        business_country = coalesce($13, business_country),
        contact_email = coalesce($14, contact_email),
        contact_phone = coalesce($15, contact_phone),
        bank_account_holder_name = coalesce($16, bank_account_holder_name),
        bank_account_number_enc = coalesce($17, bank_account_number_enc),
        bank_account_last4 = coalesce($18, bank_account_last4),
        bank_ifsc = coalesce($19, bank_ifsc),
        bank_name = coalesce($20, bank_name),
        documents = coalesce($21::jsonb, documents),
        aggregator_provider = coalesce($23, aggregator_provider),
        updated_by_gotrue_id = $22,
        updated_at = now()
      where project_ref = $1
      returning
        id, project_ref, organization_id, kyc_status, kyc_rejection_reason,
        submitted_at, reviewed_at, verified_at,
        business_legal_name, business_trade_name, business_type, pan, gstin,
        business_address_line1, business_address_line2, business_city, business_state,
        business_postal_code, business_country, contact_email, contact_phone,
        bank_account_holder_name, bank_account_number_enc, bank_account_last4,
        bank_ifsc, bank_name, documents,
        aggregator_provider, aggregator_account_id, aggregator_status, aggregator_meta,
        inserted_at, updated_at
    `,
    parameters: [
      project.ref,
      nextStatus,
      patch.business_legal_name !== undefined ? patch.business_legal_name?.trim() || null : null,
      patch.business_trade_name !== undefined ? patch.business_trade_name?.trim() || null : null,
      patch.business_type !== undefined ? patch.business_type || null : null,
      pan !== undefined ? pan : null,
      patch.gstin !== undefined ? patch.gstin?.trim().toUpperCase() || null : null,
      patch.business_address_line1 !== undefined
        ? patch.business_address_line1?.trim() || null
        : null,
      patch.business_address_line2 !== undefined
        ? patch.business_address_line2?.trim() || null
        : null,
      patch.business_city !== undefined ? patch.business_city?.trim() || null : null,
      patch.business_state !== undefined ? patch.business_state?.trim() || null : null,
      patch.business_postal_code !== undefined
        ? patch.business_postal_code?.trim() || null
        : null,
      nextCountry,
      patch.contact_email !== undefined ? patch.contact_email?.trim() || null : null,
      patch.contact_phone !== undefined ? patch.contact_phone?.trim() || null : null,
      patch.bank_account_holder_name !== undefined
        ? patch.bank_account_holder_name?.trim() || null
        : null,
      account !== undefined ? account.enc : null,
      account !== undefined ? account.last4 : null,
      ifsc !== undefined ? ifsc : null,
      patch.bank_name !== undefined ? patch.bank_name?.trim() || null : null,
      documents !== undefined ? JSON.stringify(documents) : null,
      actorId,
      nextAggregator,
    ],
    actorId,
  })
  if (updated.error) throw updated.error
  const row = updated.data?.[0]
  if (!row) throw new Error('Merchant profile not found')
  return withAccessMeta(toPublic(row), {
    organizationSlug: project.organization_slug,
    role,
  })
}

function assertReadyToSubmit(row: MerchantRow) {
  const missing: string[] = []
  if (!row.business_legal_name?.trim()) missing.push('business legal name')
  if (!row.business_type) missing.push('business type')
  if (!row.pan?.trim()) missing.push('PAN')
  if (!row.business_address_line1?.trim()) missing.push('business address')
  if (!row.business_city?.trim()) missing.push('city')
  if (!row.business_state?.trim()) missing.push('state')
  if (!row.business_postal_code?.trim()) missing.push('postal code')
  if (!row.contact_email?.trim()) missing.push('contact email')
  if (!row.bank_account_holder_name?.trim()) missing.push('bank account holder name')
  if (!row.bank_account_number_enc?.trim() || !row.bank_account_last4?.trim()) {
    missing.push('bank account number')
  }
  if (!row.bank_ifsc?.trim()) missing.push('IFSC')
  const docs = parseDocuments(row.documents)
  if (docs.length === 0) missing.push('at least one document')
  if (missing.length) {
    throw new Error(`Cannot submit KYC — missing: ${missing.join(', ')}`)
  }
}

/**
 * Publishes a KYC transition into the project's Discuss Activity channel.
 *
 * Best-effort by contract (publishDiscussEvent never throws): a merchant must never fail to get
 * verified because Discuss is unreachable. Silent when the state did not actually move.
 */
async function publishMerchantKycEvent({
  previousStatus,
  provider,
  reason,
  row,
}: {
  previousStatus: MerchantKycStatus
  provider: string | null
  reason: string | null
  row: MerchantRow
}): Promise<void> {
  if (row.kyc_status === previousStatus) return

  await publishDiscussEvent({
    projectRef: row.project_ref,
    type: 'merchant_kyc.changed',
    data: {
      status: row.kyc_status,
      previous_status: previousStatus,
      reason: reason?.trim() || row.kyc_rejection_reason || null,
      provider: provider?.trim() || null,
      changed_at: new Date().toISOString(),
    },
  })
}

export async function submitMerchantProfile({
  claims,
  ref,
}: {
  claims: Claims
  ref: string
}): Promise<MerchantProfilePublic> {
  const { actorId, project, role } = await assertMerchantAdminAccess(claims, ref)
  const current = await ensureDraftRow({
    actorId,
    projectRef: project.ref,
    organizationId: project.organization_id,
    contactEmail: getPrimaryEmail(claims),
  })

  if (current.kyc_status === 'verified') {
    throw new Error('Merchant KYC is already verified')
  }
  if (current.kyc_status === 'submitted' || current.kyc_status === 'under_review') {
    throw new Error('Merchant KYC is already under review')
  }

  assertReadyToSubmit(current)

  const settlementAdapter = resolveSettlementAdapter({
    country: current.business_country,
    storedProvider: current.aggregator_provider,
  })
  const provider = getMerchantOnboardingProvider(settlementAdapter)

  let bankAccountNumber: string | null = null
  if (current.bank_account_number_enc?.trim()) {
    try {
      bankAccountNumber = decryptString(current.bank_account_number_enc).replace(/\D/g, '') || null
    } catch {
      bankAccountNumber = null
    }
  }

  const linked = await provider.createOrUpdateLinkedAccount({
    projectRef: project.ref,
    businessLegalName: current.business_legal_name || '',
    businessType: current.business_type,
    pan: current.pan,
    gstin: current.gstin,
    contactEmail: current.contact_email,
    contactPhone: current.contact_phone,
    bankAccountHolderName: current.bank_account_holder_name,
    bankAccountLast4: current.bank_account_last4,
    bankIfsc: current.bank_ifsc,
    bankAccountNumber,
    businessAddressLine1: current.business_address_line1,
    businessAddressLine2: current.business_address_line2,
    businessCity: current.business_city,
    businessState: current.business_state,
    businessPostalCode: current.business_postal_code,
    businessCountry: current.business_country,
  })

  // BYOK path: profile moves to under_review until gateway keys + Confirm go-live.
  const nextStatus: MerchantKycStatus =
    linked.status === 'active' ? 'verified' : linked.status === 'rejected' ? 'rejected' : 'under_review'

  const updated = await executeQuery<MerchantRow>({
    query: `
      update saas.project_payment_merchants
      set
        kyc_status = $2,
        submitted_at = coalesce(submitted_at, now()),
        reviewed_at = case when $2 in ('verified', 'rejected') then now() else reviewed_at end,
        verified_at = case when $2 = 'verified' then now() else verified_at end,
        kyc_rejection_reason = case when $2 = 'rejected' then $3 else null end,
        aggregator_account_id = $4,
        aggregator_status = $5,
        aggregator_meta = $6::jsonb,
        aggregator_provider = $8,
        updated_by_gotrue_id = $7,
        updated_at = now()
      where project_ref = $1
      returning
        id, project_ref, organization_id, kyc_status, kyc_rejection_reason,
        submitted_at, reviewed_at, verified_at,
        business_legal_name, business_trade_name, business_type, pan, gstin,
        business_address_line1, business_address_line2, business_city, business_state,
        business_postal_code, business_country, contact_email, contact_phone,
        bank_account_holder_name, bank_account_number_enc, bank_account_last4,
        bank_ifsc, bank_name, documents,
        aggregator_provider, aggregator_account_id, aggregator_status, aggregator_meta,
        inserted_at, updated_at
    `,
    parameters: [
      project.ref,
      nextStatus,
      linked.message,
      linked.accountId,
      linked.status,
      JSON.stringify({ ...linked.meta, message: linked.message, stubbed: linked.stubbed }),
      actorId,
      linked.provider,
    ],
    actorId,
  })
  if (updated.error) throw updated.error
  const row = updated.data?.[0]
  if (!row) throw new Error('Merchant profile not found')

  await publishMerchantKycEvent({
    previousStatus: current.kyc_status,
    provider: linked.provider,
    reason: linked.message,
    row,
  })

  return withAccessMeta(toPublic(row), {
    organizationSlug: project.organization_slug,
    role,
  })
}

/**
 * Owner/admin review for settlement go-live (or explicit reject).
 * Unblocks live charges / checkout MCP tools when status becomes verified.
 * Works for both India and international rails (India Linked Account API still stubbed).
 */
export async function reviewMerchantProfile({
  claims,
  ref,
  decision,
  reason,
}: {
  claims: Claims
  ref: string
  decision: 'verify' | 'reject'
  reason?: string | null
}): Promise<MerchantProfilePublic> {
  const { actorId, project, role } = await assertMerchantAdminAccess(claims, ref)
  const current = await ensureDraftRow({
    actorId,
    projectRef: project.ref,
    organizationId: project.organization_id,
    contactEmail: getPrimaryEmail(claims),
  })

  if (current.kyc_status === 'verified' && decision === 'verify') {
    throw new Error('Merchant KYC is already verified')
  }
  if (current.kyc_status !== 'submitted' && current.kyc_status !== 'under_review') {
    throw new Error(
      `Cannot ${decision} merchant KYC while status is "${current.kyc_status}". Submit KYC first.`
    )
  }

  const settlementAdapter = resolveSettlementAdapter({
    country: current.business_country,
    storedProvider: current.aggregator_provider,
  })

  if (decision === 'reject') {
    const rejection =
      typeof reason === 'string' && reason.trim()
        ? reason.trim()
        : 'Merchant KYC rejected by organization admin.'
    const updated = await executeQuery<MerchantRow>({
      query: `
        update saas.project_payment_merchants
        set
          kyc_status = 'rejected',
          kyc_rejection_reason = $2,
          reviewed_at = now(),
          verified_at = null,
          aggregator_status = 'rejected',
          aggregator_meta = coalesce(aggregator_meta, '{}'::jsonb) || $3::jsonb,
          updated_by_gotrue_id = $4,
          updated_at = now()
        where project_ref = $1
        returning
          id, project_ref, organization_id, kyc_status, kyc_rejection_reason,
          submitted_at, reviewed_at, verified_at,
          business_legal_name, business_trade_name, business_type, pan, gstin,
          business_address_line1, business_address_line2, business_city, business_state,
          business_postal_code, business_country, contact_email, contact_phone,
          bank_account_holder_name, bank_account_number_enc, bank_account_last4,
          bank_ifsc, bank_name, documents,
          aggregator_provider, aggregator_account_id, aggregator_status, aggregator_meta,
          inserted_at, updated_at
      `,
      parameters: [
        project.ref,
        rejection,
        JSON.stringify({
          reviewed_at: new Date().toISOString(),
          decision: 'reject',
          settlement_adapter: settlementAdapter,
        }),
        actorId,
      ],
      actorId,
    })
    if (updated.error) throw updated.error
    const row = updated.data?.[0]
    if (!row) throw new Error('Merchant profile not found')

    await publishMerchantKycEvent({
      previousStatus: current.kyc_status,
      provider: settlementAdapter,
      reason: rejection,
      row,
    })

    return withAccessMeta(toPublic(row), {
      organizationSlug: project.organization_slug,
      role,
    })
  }

  const updated = await executeQuery<MerchantRow>({
    query: `
      update saas.project_payment_merchants
      set
        kyc_status = 'verified',
        kyc_rejection_reason = null,
        reviewed_at = now(),
        verified_at = now(),
        aggregator_provider = $2,
        aggregator_status = 'active',
        aggregator_meta = coalesce(aggregator_meta, '{}'::jsonb) || $3::jsonb,
        updated_by_gotrue_id = $4,
        updated_at = now()
      where project_ref = $1
      returning
        id, project_ref, organization_id, kyc_status, kyc_rejection_reason,
        submitted_at, reviewed_at, verified_at,
        business_legal_name, business_trade_name, business_type, pan, gstin,
        business_address_line1, business_address_line2, business_city, business_state,
        business_postal_code, business_country, contact_email, contact_phone,
        bank_account_holder_name, bank_account_number_enc, bank_account_last4,
        bank_ifsc, bank_name, documents,
        aggregator_provider, aggregator_account_id, aggregator_status, aggregator_meta,
        inserted_at, updated_at
    `,
    parameters: [
      project.ref,
      settlementAdapter,
      JSON.stringify({
        reviewed_at: new Date().toISOString(),
        decision: 'verify',
        settlement_adapter: settlementAdapter,
        message:
          settlementAdapter === 'stripe'
            ? 'Verified for international card settlement. Finish card settlement setup in Indobase Payments, then create checkout sessions / subscriptions.'
            : 'Verified for India settlements. Settlements target the merchant bank account once the India aggregator Linked Account path is fully connected.',
      }),
      actorId,
    ],
    actorId,
  })
  if (updated.error) throw updated.error
  const row = updated.data?.[0]
  if (!row) throw new Error('Merchant profile not found')

  await publishMerchantKycEvent({
    previousStatus: current.kyc_status,
    provider: settlementAdapter,
    reason: null,
    row,
  })

  return withAccessMeta(toPublic(row), {
    organizationSlug: project.organization_slug,
    role,
  })
}

/**
 * BYOK: merchant completes KYC on Razorpay/Stripe, pastes API keys here.
 * Validates keys against the PSP, encrypts at rest, marks project ready to charge.
 */
export async function connectMerchantGatewayKeys({
  claims,
  ref,
  body,
}: {
  claims: Claims
  ref: string
  body: GatewayConnectBody
}): Promise<MerchantProfilePublic> {
  const { actorId, project } = await assertMerchantAdminAccess(claims, ref)
  await ensureDraftRow({
    actorId,
    projectRef: project.ref,
    organizationId: project.organization_id,
    contactEmail: getPrimaryEmail(claims),
  })

  const market = body.settlement_market
  if (market !== 'india' && market !== 'international') {
    throw new Error('settlement_market must be india or international')
  }

  const adapter = adapterForSettlementMarket(market)
  let publicHint = ''
  let metaExtra: Record<string, unknown> = {}
  const links = GATEWAY_EXTERNAL_LINKS[market]
  let razorpayPlain:
    | { keyId: string; keySecret: string; webhookSecret?: string }
    | undefined
  let stripePlain:
    | { secretKey: string; publishableKey?: string; webhookSecret?: string }
    | undefined

  if (market === 'india') {
    const keyId = (body.key_id || '').trim()
    const keySecret = (body.key_secret || '').trim()
    const webhookSecret = (body.webhook_secret || '').trim()
    if (!keyId.startsWith('rzp_')) {
      throw new Error(
        'Razorpay Key Id must start with rzp_ — create an account and finish KYC at Razorpay, then copy keys from the dashboard'
      )
    }
    if (keySecret.length < 16) {
      throw new Error('Razorpay Key Secret looks invalid')
    }
    await validateRazorpayKeys(keyId, keySecret)
    publicHint = hintId(keyId)
    razorpayPlain = {
      keyId,
      keySecret,
      ...(webhookSecret ? { webhookSecret } : {}),
    }
    metaExtra = {
      gateway_provider: 'razorpay',
      gateway_key_id_hint: publicHint,
      gateway_key_id_enc: encryptString(keyId),
      gateway_key_secret_enc: encryptString(keySecret),
      ...(webhookSecret ? { gateway_webhook_secret_enc: encryptString(webhookSecret) } : {}),
      gateway_signup_url: links.signup,
      gateway_kyc_url: links.kyc,
      gateway_keys_url: links.keys,
    }
  } else {
    const secretKey = (body.secret_key || '').trim()
    const publishableKey = (body.publishable_key || '').trim()
    const webhookSecret = (body.webhook_secret || '').trim()
    if (!secretKey.startsWith('sk_')) {
      throw new Error(
        'Stripe secret key must start with sk_ — create an account and finish verification at Stripe, then copy keys from the dashboard'
      )
    }
    if (!publishableKey.startsWith('pk_')) {
      throw new Error(
        'Stripe publishable key (pk_…) is required — copy it from the Stripe Dashboard API keys page'
      )
    }
    await validateStripeKeys(secretKey)
    publicHint = hintId(secretKey)
    stripePlain = {
      secretKey,
      ...(publishableKey ? { publishableKey } : {}),
      ...(webhookSecret ? { webhookSecret } : {}),
    }
    metaExtra = {
      gateway_provider: 'stripe',
      gateway_key_id_hint: publicHint,
      gateway_secret_key_enc: encryptString(secretKey),
      ...(publishableKey
        ? { gateway_publishable_key_enc: encryptString(publishableKey) }
        : {}),
      ...(webhookSecret ? { gateway_webhook_secret_enc: encryptString(webhookSecret) } : {}),
      gateway_signup_url: links.signup,
      gateway_kyc_url: links.kyc,
      gateway_keys_url: links.keys,
    }
  }

  // Studio-only BYOK: keys stay encrypted here; checkout calls Razorpay/Stripe directly.
  const sync = await syncMerchantGatewayKeysToPayments({
    claims,
    ref: project.ref,
    market,
    razorpay: razorpayPlain,
    stripe: stripePlain,
  })

  const message = sync.ok
    ? market === 'india'
      ? 'Razorpay keys connected in Studio. Ask an agent to wireCheckout (Buy/Subscribe CTA).'
      : 'Stripe keys connected in Studio. Ask an agent to wireCheckout (Buy/Subscribe CTA).'
    : market === 'india'
      ? `Razorpay keys could not be saved (${sync.message}). Retry Connect gateway.`
      : `Stripe keys could not be saved (${sync.message}). Retry Connect gateway.`

  const updated = await executeQuery<MerchantRow>({
    query: `
      update saas.project_payment_merchants
      set
        kyc_status = 'verified',
        submitted_at = coalesce(submitted_at, now()),
        reviewed_at = now(),
        verified_at = now(),
        kyc_rejection_reason = null,
        aggregator_provider = $2,
        aggregator_account_id = $3,
        aggregator_status = $6,
        aggregator_meta = coalesce(aggregator_meta, '{}'::jsonb) || $4::jsonb,
        business_country = case
          when $2 = 'razorpay_route' then 'IN'
          else coalesce(nullif(business_country, ''), 'US')
        end,
        updated_by_gotrue_id = $5,
        updated_at = now()
      where project_ref = $1
      returning
        id, project_ref, organization_id, kyc_status, kyc_rejection_reason,
        submitted_at, reviewed_at, verified_at,
        business_legal_name, business_trade_name, business_type, pan, gstin,
        business_address_line1, business_address_line2, business_city, business_state,
        business_postal_code, business_country, contact_email, contact_phone,
        bank_account_holder_name, bank_account_number_enc, bank_account_last4,
        bank_ifsc, bank_name, documents,
        aggregator_provider, aggregator_account_id, aggregator_status, aggregator_meta,
        inserted_at, updated_at
    `,
    parameters: [
      project.ref,
      adapter,
      publicHint,
      JSON.stringify({
        ...metaExtra,
        gateway_keys_configured: true,
        gateway_connected_at: new Date().toISOString(),
        gateway_connector_synced: sync.ok,
        gateway_connector_id: sync.connectorId || null,
        gateway_connector_sync_message: sync.message,
        message,
        stubbed: false,
        byok: true,
        settlement_adapter: adapter,
        settlement_market: market,
      }),
      actorId,
      'keys_connected',
    ],
    actorId,
  })
  if (updated.error) throw updated.error
  if (!updated.data?.[0]) throw new Error('Merchant profile not found')

  return getMerchantProfile({ claims, ref })
}

/**
 * Server-side decrypt of BYOK gateway credentials for direct Razorpay/Stripe checkout.
 * Never expose these fields on MerchantProfilePublic.
 */
export async function getDecryptedMerchantGatewayKeys({
  claims,
  ref,
}: {
  claims: Claims
  ref: string
}): Promise<{
  market: 'india' | 'international'
  razorpay?: { keyId: string; keySecret: string; webhookSecret?: string }
  stripe?: { secretKey: string; publishableKey?: string; webhookSecret?: string }
} | null> {
  const profile = await getMerchantProfile({ claims, ref })
  if (!profile.gateway_keys_configured) return null

  const { actorId } = await assertMerchantAdminAccess(claims, ref)
  const loaded = await executeQuery<MerchantRow>({
    query: `
      select
        id, project_ref, organization_id, kyc_status, kyc_rejection_reason,
        submitted_at, reviewed_at, verified_at,
        business_legal_name, business_trade_name, business_type, pan, gstin,
        business_address_line1, business_address_line2, business_city, business_state,
        business_postal_code, business_country, contact_email, contact_phone,
        bank_account_holder_name, bank_account_number_enc, bank_account_last4,
        bank_ifsc, bank_name, documents,
        aggregator_provider, aggregator_account_id, aggregator_status, aggregator_meta,
        inserted_at, updated_at
      from saas.project_payment_merchants
      where project_ref = $1
      limit 1
    `,
    parameters: [ref],
    actorId,
  })
  if (loaded.error) throw loaded.error
  const row = loaded.data?.[0]
  if (!row) return null

  const meta =
    typeof row.aggregator_meta === 'string'
      ? (JSON.parse(row.aggregator_meta || '{}') as Record<string, unknown>)
      : (row.aggregator_meta || {})

  const market = profile.settlement_market === 'india' ? 'india' : 'international'
  const decryptOpt = (v: unknown): string | undefined => {
    if (typeof v !== 'string' || !v.trim()) return undefined
    try {
      return decryptString(v)
    } catch {
      return undefined
    }
  }

  if (market === 'india') {
    const keyId = decryptOpt(meta.gateway_key_id_enc)
    const keySecret = decryptOpt(meta.gateway_key_secret_enc)
    if (!keyId || !keySecret) return null
    return {
      market,
      razorpay: {
        keyId,
        keySecret,
        webhookSecret: decryptOpt(meta.gateway_webhook_secret_enc),
      },
    }
  }

  const secretKey = decryptOpt(meta.gateway_secret_key_enc)
  if (!secretKey) return null
  return {
    market,
    stripe: {
      secretKey,
      publishableKey: decryptOpt(meta.gateway_publishable_key_enc),
      webhookSecret: decryptOpt(meta.gateway_webhook_secret_enc),
    },
  }
}

/** Hard gate for live charges / checkout (MCP + APIs). Browse remains allowed when false. */
export async function assertMerchantCanGoLive({
  claims,
  ref,
}: {
  claims: Claims
  ref: string
}): Promise<MerchantProfilePublic> {
  const profile = await getMerchantProfile({ claims, ref })
  if (!profile.can_go_live) {
    throw new Error(
      `Payment gateway not ready ("${profile.kyc_status}"). Complete KYC on Razorpay or Stripe, paste API keys in Studio Payments (Connect gateway), then try again.`
    )
  }
  return profile
}

/** Lightweight go-live probe for MCP server options (no throw). */
export async function getMerchantCanGoLive({
  claims,
  ref,
}: {
  claims: Claims
  ref: string
}): Promise<boolean> {
  try {
    const profile = await getMerchantProfile({ claims, ref })
    return profile.can_go_live === true
  } catch {
    return false
  }
}
